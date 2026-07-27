import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { EnvService } from '@uc/core';
import { OracleSourceRegistry } from '../oracle-sources/oracle-source.registry';
import { OracleSource } from '../oracle-sources/oracle-source.interface';

export interface OracleResult {
  rate: number;
  rawRates: Record<string, number | null>;
  usedSources: string[];
  droppedSources: string[];
  cachedAt: Date;
  method: 'median' | 'single';
}

enum CircuitState { CLOSED, OPEN, HALF_OPEN }

class OracleCircuitBreaker {
  private state = CircuitState.CLOSED;
  private consecutiveFailures = 0;
  private lastFailureAt: Date | null = null;
  private readonly FAILURE_THRESHOLD = 3;
  private readonly RECOVERY_TIMEOUT_MS = 30_000;

  constructor(private readonly envService: EnvService) {}

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
    const slackWebhook = this.envService.get('SLACK_ALERT_WEBHOOK');
    if (slackWebhook) {
      axios.post(slackWebhook, {
        text: `🚨 *${type}*\n\`\`\`${JSON.stringify(payload, null, 2)}\`\`\``,
      }).catch(() => {});
    }
  }
}

@Injectable()
export class OracleService {
  private cache: OracleResult | null = null;
  private circuitBreaker: OracleCircuitBreaker;

  constructor(
    private readonly envService: EnvService,
    private readonly registry: OracleSourceRegistry
  ) {
    this.circuitBreaker = new OracleCircuitBreaker(this.envService);
  }

  private calculateMedian(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? (sorted[mid - 1]! + sorted[mid]!) / 2
      : sorted[mid]!;
  }

  private detectOutliersThreshold(
    rates: { name: string; value: number }[],
    thresholdPct: number
  ): { valid: typeof rates; outliers: string[] } {
    if (rates.length < 2) return { valid: rates, outliers: [] };

    const tempMedian = this.calculateMedian(rates.map(r => r.value));
    const outliers: string[] = [];
    const valid: typeof rates = [];

    for (const r of rates) {
      const diffPct = Math.abs(r.value - tempMedian) / tempMedian * 100;
      if (diffPct > thresholdPct) {
        outliers.push(`${r.name} (${r.value.toFixed(0)}, diff ${diffPct.toFixed(1)}%)`);
      } else {
        valid.push(r);
      }
    }

    return valid.length === 0 ? { valid: rates, outliers: [] } : { valid, outliers };
  }

  private detectOutliersIQR(
    rates: { name: string; value: number }[]
  ): { valid: typeof rates; outliers: string[] } {
    if (rates.length < 3) return { valid: rates, outliers: [] };

    const sorted = [...rates].map(r => r.value).sort((a, b) => a - b);
    const q1 = sorted[Math.floor(sorted.length * 0.25)]!;
    const q3 = sorted[Math.floor(sorted.length * 0.75)]!;
    const iqr = q3 - q1;
    const lower = q1 - 1.5 * iqr;
    const upper = q3 + 1.5 * iqr;

    const valid: typeof rates = [];
    const outliers: string[] = [];

    for (const r of rates) {
      if (r.value < lower || r.value > upper) {
        outliers.push(`${r.name} (${r.value.toFixed(0)}, IQR bounds: ${lower.toFixed(0)}-${upper.toFixed(0)})`);
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

    const cacheTtlMs = this.envService.get('ORACLE_CACHE_TTL_MS') ?? 60000;
    if (this.cache && Date.now() - this.cache.cachedAt.getTime() < cacheTtlMs) {
      return this.cache;
    }

    console.log('[FX Oracle] Fetching from all sources...');

    const configuredSourcesEnv = this.envService.get('ORACLE_SOURCES') ?? 'vietcombank,coingecko_usdc,coingecko_usdt,exchangerate_api_usd,currency_api_usd,exchangerate_host';
    const activeSourceNames = configuredSourcesEnv.split(',').map(s => s.trim().toLowerCase());

    const allSources = this.registry.getSources();
    const activeSources = allSources.filter(s => activeSourceNames.includes(s.name.toLowerCase()));

    if (activeSources.length === 0) {
      throw new Error('No active oracle sources configured.');
    }

    const results = await Promise.allSettled(
      activeSources.map(async s => ({
        name: s.name,
        value: await s.fetch(),
      }))
    );

    const bounds = {
      MIN: this.envService.get('ORACLE_HARD_BOUND_MIN') ?? 23000,
      MAX: this.envService.get('ORACLE_HARD_BOUND_MAX') ?? 28000,
    };
    const safetySpread = this.envService.get('ORACLE_SAFETY_SPREAD') ?? 0.99;
    const minValidSources = this.envService.get('ORACLE_MIN_VALID_SOURCES') ?? 3;

    const rawRates: Record<string, number | null> = {};
    const successRates: { name: string; value: number }[] = [];
    const droppedSources: string[] = [];

    for (let i = 0; i < results.length; i++) {
      const result = results[i]!;
      const sourceName = activeSources[i]!.name;

      if (result.status === 'fulfilled') {
        const rate = result.value.value;
        rawRates[sourceName] = rate;

        if (rate < bounds.MIN || rate > bounds.MAX) {
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

    let valid = successRates;
    let outliers: string[] = [];

    const outlierMethod = this.envService.get('ORACLE_OUTLIER_METHOD') ?? 'iqr';
    
    if (successRates.length >= minValidSources) {
      if (outlierMethod === 'iqr') {
        const iqrResult = this.detectOutliersIQR(successRates);
        valid = iqrResult.valid;
        outliers = iqrResult.outliers;
      } else {
        const thresholdPct = this.envService.get('ORACLE_OUTLIER_THRESHOLD_PCT') ?? 3;
        const thresholdResult = this.detectOutliersThreshold(successRates, thresholdPct);
        valid = thresholdResult.valid;
        outliers = thresholdResult.outliers;
      }
    } else {
      console.warn(`[FX Oracle] Only ${successRates.length} valid sources available (min: ${minValidSources}). Bypassing outlier detection.`);
    }

    if (outliers.length > 0) {
      console.warn('[FX Oracle] Outliers dropped:', outliers);
      droppedSources.push(...outliers.map(o => `OUTLIER: ${o}`));
    }
    
    if (valid.length === 0) {
      valid = successRates;
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

    finalRate = finalRate * safetySpread;

    if (finalRate < bounds.MIN || finalRate > bounds.MAX) {
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
