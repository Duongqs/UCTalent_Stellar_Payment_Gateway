import { Injectable } from '@nestjs/common';
import axios from 'axios';

interface OracleSource {
  name: string;
  fetch: () => Promise<number>;
}

export interface OracleResult {
  rate: number;
  rawRates: Record<string, number | null>;
  usedSources: string[];
  droppedSources: string[];
  cachedAt: Date;
  method: 'median' | 'single';
}

const BOUNDS = {
  MIN: parseInt(process.env.ORACLE_HARD_BOUND_MIN || '23000'),
  MAX: parseInt(process.env.ORACLE_HARD_BOUND_MAX || '28000'),
};
const OUTLIER_THRESHOLD_PCT = 3;
const SAFETY_SPREAD = parseFloat(process.env.ORACLE_SAFETY_SPREAD || '0.99');
const CACHE_TTL_MS = parseInt(process.env.ORACLE_CACHE_TTL_MS || '60000');
const SOURCE_TIMEOUT_MS = 5_000;

enum CircuitState { CLOSED, OPEN, HALF_OPEN }

class OracleCircuitBreaker {
  private state = CircuitState.CLOSED;
  private consecutiveFailures = 0;
  private lastFailureAt: Date | null = null;
  private readonly FAILURE_THRESHOLD = 3;
  private readonly RECOVERY_TIMEOUT_MS = 30_000;

  isOpen(): boolean {
    if (this.state !== CircuitState.OPEN) return false;
    if (this.lastFailureAt && Date.now() - this.lastFailureAt.getTime() > this.RECOVERY_TIMEOUT_MS) {
      this.state = CircuitState.HALF_OPEN;
      console.log('[FX Oracle] Circuit breaker → HALF_OPEN (attempting recovery)');
      return false;
    }
    return true;
  }

  recordSuccess(): void {
    if (this.state !== CircuitState.CLOSED) {
      console.log('[FX Oracle] Circuit breaker → CLOSED (recovered)');
    }
    this.state = CircuitState.CLOSED;
    this.consecutiveFailures = 0;
  }

  recordFailure(): void {
    this.consecutiveFailures++;
    this.lastFailureAt = new Date();
    if (this.consecutiveFailures >= this.FAILURE_THRESHOLD) {
      this.state = CircuitState.OPEN;
      this.emitAlert('oracle_circuit_opened', {
        consecutive_failures: this.consecutiveFailures,
        message: 'All oracle sources unavailable. Disbursements halted.',
      });
    }
  }

  getState(): string {
    return CircuitState[this.state];
  }

  private emitAlert(type: string, payload: Record<string, any>): void {
    console.error(`[ALERT:${type}]`, JSON.stringify(payload));
    if (process.env.SLACK_ALERT_WEBHOOK) {
      axios.post(process.env.SLACK_ALERT_WEBHOOK, {
        text: `🚨 *${type}*\n\`\`\`${JSON.stringify(payload, null, 2)}\`\`\``,
      }).catch(() => {});
    }
  }
}

@Injectable()
export class OracleService {
  private cache: OracleResult | null = null;
  private circuitBreaker = new OracleCircuitBreaker();

  private sources: OracleSource[] = [
    {
      name: 'CoinGecko_USDC',
      fetch: async () => {
        const res = await axios.get(
          'https://api.coingecko.com/api/v3/simple/price',
          { params: { ids: 'usd-coin', vs_currencies: 'vnd' }, timeout: SOURCE_TIMEOUT_MS }
        );
        const rate = res.data?.['usd-coin']?.vnd;
        if (!rate || typeof rate !== 'number') throw new Error('Invalid response');
        return rate;
      },
    },
    {
      name: 'CoinGecko_USDT_Proxy',
      fetch: async () => {
        const res = await axios.get(
          'https://api.coingecko.com/api/v3/simple/price',
          { params: { ids: 'tether', vs_currencies: 'vnd' }, timeout: SOURCE_TIMEOUT_MS }
        );
        const rate = res.data?.['tether']?.vnd;
        if (!rate || typeof rate !== 'number') throw new Error('Invalid response');
        return rate;
      },
    },
    {
      name: 'ExchangeRateAPI_USD',
      fetch: async () => {
        const res = await axios.get(
          'https://open.er-api.com/v6/latest/USD',
          { timeout: SOURCE_TIMEOUT_MS }
        );
        const rate = res.data?.rates?.VND;
        if (!rate || typeof rate !== 'number') throw new Error('Invalid response');
        return rate * 1.015;
      },
    },
    {
      name: 'CurrencyAPI_USD',
      fetch: async () => {
        const res = await axios.get(
          'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json',
          { timeout: SOURCE_TIMEOUT_MS }
        );
        const rate = res.data?.usd?.vnd;
        if (!rate || typeof rate !== 'number') throw new Error('Invalid response');
        return rate * 1.015;
      },
    },
    {
      name: 'NinePay_Merchant_Rate',
      fetch: async () => {
        const apiUrl = process.env.NINEPAY_API_URL || 'https://sandbox.9pay.vn';
        const res = await axios.get(
          `${apiUrl}/v1/exchange-rate?currency=USD`,
          { timeout: 2000 }
        );
        const rate = res.data?.data?.exchangeRate;
        if (!rate || typeof rate !== 'number') throw new Error('Invalid 9Pay response');
        return rate;
      },
    }
  ];

  private calculateMedian(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? (sorted[mid - 1]! + sorted[mid]!) / 2
      : sorted[mid]!;
  }

  private detectOutliers(
    rates: { name: string; value: number }[]
  ): { valid: typeof rates; outliers: string[] } {
    if (rates.length < 2) return { valid: rates, outliers: [] };

    const tempMedian = this.calculateMedian(rates.map(r => r.value));
    const outliers: string[] = [];
    const valid: typeof rates = [];

    for (const r of rates) {
      const diffPct = Math.abs(r.value - tempMedian) / tempMedian * 100;
      if (diffPct > OUTLIER_THRESHOLD_PCT) {
        outliers.push(`${r.name} (${r.value.toFixed(0)}, diff ${diffPct.toFixed(1)}%)`);
      } else {
        valid.push(r);
      }
    }

    return valid.length === 0 ? { valid: rates, outliers: [] } : { valid, outliers };
  }

  async getSafeFxRate(): Promise<OracleResult> {
    if (this.circuitBreaker.isOpen()) {
      throw new Error('CIRCUIT_OPEN: FX Oracle unavailable. All disbursements halted for safety.');
    }

    if (this.cache && Date.now() - this.cache.cachedAt.getTime() < CACHE_TTL_MS) {
      return this.cache;
    }

    console.log('[FX Oracle] Fetching from all sources...');

    const results = await Promise.allSettled(
      this.sources.map(async s => ({
        name: s.name,
        value: await s.fetch(),
      }))
    );

    const rawRates: Record<string, number | null> = {};
    const successRates: { name: string; value: number }[] = [];
    const droppedSources: string[] = [];

    for (let i = 0; i < results.length; i++) {
      const result = results[i]!;
      const sourceName = this.sources[i]!.name;

      if (result.status === 'fulfilled') {
        const rate = result.value.value;
        rawRates[sourceName] = rate;

        if (rate < BOUNDS.MIN || rate > BOUNDS.MAX) {
          droppedSources.push(`${sourceName} (${rate.toFixed(0)}, out of bounds)`);
        } else {
          successRates.push({ name: sourceName, value: rate });
        }
      } else {
        rawRates[sourceName] = null;
        droppedSources.push(`${sourceName} (ERROR: ${result.reason?.message ?? 'unknown'})`);
      }
    }

    if (successRates.length === 0) {
      this.circuitBreaker.recordFailure();
      throw new Error('ALL_SOURCES_FAILED: No valid oracle data. Disbursement halted.');
    }

    this.circuitBreaker.recordSuccess();

    const { valid, outliers } = this.detectOutliers(successRates);
    if (outliers.length > 0) {
      console.warn('[FX Oracle] Outliers dropped:', outliers);
      droppedSources.push(...outliers.map(o => `OUTLIER: ${o}`));
    }

    const validRates = valid.map(r => r.value);
    const usedSources = valid.map(r => r.name);
    let method: OracleResult['method'];
    let finalRate: number;

    if (validRates.length === 1) {
      finalRate = validRates[0]!;
      method = 'single';
    } else {
      finalRate = this.calculateMedian(validRates);
      method = 'median';
    }

    finalRate = finalRate * SAFETY_SPREAD;

    if (finalRate < BOUNDS.MIN || finalRate > BOUNDS.MAX) {
      throw new Error(`[FX Oracle] Final rate ${finalRate.toFixed(0)} out of safe bounds after spread. Disbursement halted.`);
    }

    const oracleResult: OracleResult = {
      rate: Math.floor(finalRate),
      rawRates,
      usedSources,
      droppedSources,
      cachedAt: new Date(),
      method,
    };

    this.cache = oracleResult;

    console.log('----------------------------------------------------');
    console.log(`[FX Oracle SEP-38] Execution Log`);
    console.log(`- Raw Rates Fetched:`, rawRates);
    console.log(`- Dropped Sources:`, droppedSources);
    console.log(`- Valid Sources Used:`, usedSources);
    console.log(`- Calculation Method: ${method} of [${validRates.join(', ')}]`);
    console.log(`- FINAL Safe Rate: ${oracleResult.rate} VND/USDC`);
    console.log('----------------------------------------------------');

    return oracleResult;
  }

  invalidateCache(): void {
    this.cache = null;
    console.log('[FX Oracle] Cache invalidated.');
  }

  getCircuitBreakerState(): string {
    return this.circuitBreaker.getState();
  }

  resetCircuitBreaker(): void {
    (this.circuitBreaker as any).state = 0;
    (this.circuitBreaker as any).consecutiveFailures = 0;
    (this.circuitBreaker as any).lastFailureAt = null;
  }
}
