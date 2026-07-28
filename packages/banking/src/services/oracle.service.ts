import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { EnvService } from '@uc/core';
import { OracleSourceRegistry } from '../oracle-sources/oracle-source.registry';
import { OracleSource } from '../oracle-sources/oracle-source.interface';

enum CircuitState { CLOSED, OPEN, HALF_OPEN }

class OracleCircuitBreaker {
  private state = CircuitState.CLOSED;
  private consecutiveFailures = 0;
  private lastFailureAt: Date | null = null;
  private readonly FAILURE_THRESHOLD: number;
  private readonly RECOVERY_TIMEOUT_MS: number;

  constructor(private readonly envService: EnvService) {
    this.FAILURE_THRESHOLD = Number(this.envService.get('ORACLE_CIRCUIT_FAILURE_THRESHOLD')) || 3;
    this.RECOVERY_TIMEOUT_MS = Number(this.envService.get('ORACLE_CIRCUIT_RECOVERY_MS')) || 30_000;
  }

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

  reset(): void {
    this.state = CircuitState.CLOSED;
    this.consecutiveFailures = 0;
    this.lastFailureAt = null;
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

export interface OracleResult {
  rate: number;
  rawRates: Record<string, number | null>;
  usedSources: string[];
  droppedSources: string[];
  cachedAt: Date;
  method: 'weighted_median' | 'single' | 'require_confirmation';
}

@Injectable()
export class OracleService {
  private cache: OracleResult | null = null;
  private circuitBreaker: OracleCircuitBreaker;

  constructor(
    private readonly envService: EnvService,
    private readonly registry: OracleSourceRegistry,
  ) {
    this.circuitBreaker = new OracleCircuitBreaker(this.envService);
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

  private calculateMedian(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? (sorted[mid - 1]! + sorted[mid]!) / 2
      : sorted[mid]!;
  }

  private weightedMedian(items: { value: number; weight: number }[]): number {
    if (items.length === 0) return 0;
    const sorted = [...items].sort((a, b) => a.value - b.value);
    const total = sorted.reduce((s, it) => s + (it.weight ?? 1), 0);
    let acc = 0;
    for (let i = 0; i < sorted.length; i++) {
      const it = sorted[i]!;
      acc += it.weight ?? 1;
      if (acc > total / 2) return it.value;
      if (acc === total / 2) {
        // even split: return average of this and next value to match simple median behaviour
        const next = sorted[i + 1];
        if (next) return (it.value + next.value) / 2;
        return it.value;
      }
    }
    return sorted[sorted.length - 1]!.value;
  }

  private detectOutliersIQR(rates: { name: string; value: number }[]) {
    if (rates.length < 3) return { valid: rates, outliers: [] };
    const sortedVals = [...rates].map(r => r.value).sort((a, b) => a - b);
    const q1 = sortedVals[Math.floor(sortedVals.length * 0.25)]!;
    const q3 = sortedVals[Math.floor(sortedVals.length * 0.75)]!;
    const iqr = q3 - q1;
    const lower = q1 - 1.5 * iqr;
    const upper = q3 + 1.5 * iqr;
    const valid: typeof rates = [];
    const outliers: string[] = [];
    for (const r of rates) {
      if (r.value < lower || r.value > upper) {
        outliers.push(`${r.name} (${r.value.toFixed(0)}, IQR bounds: ${lower.toFixed(0)}-${upper.toFixed(0)})`);
      } else valid.push(r);
    }
    return valid.length === 0 ? { valid: rates, outliers: [] } : { valid, outliers };
  }

  private detectOutliersThreshold(rates: { name: string; value: number }[], thresholdPct: number) {
    if (rates.length < 2) return { valid: rates, outliers: [] };
    const tempMedian = this.calculateMedian(rates.map(r => r.value));
    const valid: typeof rates = [];
    const outliers: string[] = [];
    for (const r of rates) {
      const diffPct = Math.abs(r.value - tempMedian) / tempMedian;
      if (diffPct > thresholdPct) outliers.push(`${r.name} (${r.value.toFixed(0)}, diff ${(diffPct * 100).toFixed(2)}%)`);
      else valid.push(r);
    }
    return valid.length === 0 ? { valid: rates, outliers: [] } : { valid, outliers };
  }

  async getSafeFxRate(): Promise<OracleResult> {
    const cacheTtlMs = this.envService.get('ORACLE_CACHE_TTL_MS') ?? 60000;
    // Safety: if circuit breaker is open, halt immediately
    if (this.circuitBreaker && this.circuitBreaker.isOpen()) {
      throw new Error('CIRCUIT_OPEN: FX Oracle unavailable. All disbursements halted for safety.');
    }
    if (this.cache && Date.now() - this.cache.cachedAt.getTime() < cacheTtlMs) return this.cache;

    console.log('[FX Oracle] Fetching from all sources (new algorithm)...');

    const configuredSourcesEnv = this.envService.get('ORACLE_SOURCES') ?? '';
    const activeSourceNames = configuredSourcesEnv.split(',').map((s: string) => s.trim().toLowerCase()).filter(Boolean);

    const allSources = this.registry.getSources();
    const activeSources = allSources.filter(s => activeSourceNames.includes(s.name.toLowerCase()));

    if (activeSources.length === 0) throw new Error('No active oracle sources configured.');

    // Step 1: fetch all sources in parallel
    const results = await Promise.allSettled(activeSources.map(s => s.fetch().then(value => ({ name: s.name, value, source: s }))));

    const rawRates: Record<string, number | null> = {};
    const droppedSources: string[] = [];

    // categorize results
    const catA: { name: string; value: number; source: OracleSource }[] = [];
    const catB: { name: string; value: number; source: OracleSource }[] = [];
    const catC: { name: string; value: number; source: OracleSource }[] = [];

    const boundsMin = this.envService.get('ORACLE_HARD_BOUND_MIN') ?? 23000;
    const boundsMax = this.envService.get('ORACLE_HARD_BOUND_MAX') ?? 28000;
    const safetySpread = this.envService.get('ORACLE_SAFETY_SPREAD') ?? 0.995;
    const minValidSources = this.envService.get('ORACLE_MIN_VALID_SOURCES') ?? 4;
    const outlierMethod = this.envService.get('ORACLE_OUTLIER_METHOD') ?? 'iqr';
    const outlierThreshold = this.envService.get('ORACLE_OUTLIER_THRESHOLD_PCT') ?? 3;
    const pegAlertPct = this.envService.get('ORACLE_PEG_DEVIATION_ALERT') ?? 0.005;
    const rateChangeGuard = this.envService.get('ORACLE_RATE_CHANGE_GUARD_PCT') ?? 0.03;
    const crossGroupMaxDiff = this.envService.get('ORACLE_CROSS_GROUP_MAX_DIFF') ?? 0.02;

    for (let i = 0; i < results.length; i++) {
      const res = results[i]!;
      const src = activeSources[i]!;
      const name = src.name;
      if (res.status === 'fulfilled') {
        const val = res.value.value;
        rawRates[name] = val;
        // Bounds check applies to USD->VND and USDC->VND (A and B)
        const cat = (src.category ?? 'A'); // backward compat: default to 'A'
        if ((cat === 'A' || cat === 'B') && (val < boundsMin || val > boundsMax)) {
          droppedSources.push(`${name} (${val.toFixed(0)}, out of bounds)`);
        } else {
          if (cat === 'A') catA.push({ name, value: val, source: src });
          else if (cat === 'B') catB.push({ name, value: val, source: src });
          else if (cat === 'C') catC.push({ name, value: val, source: src });
        }
      } else {
        rawRates[name] = null;
        droppedSources.push(`${name} (ERROR: ${res.reason?.message ?? 'unknown'})`);
      }
    }

    // If no source returned any value at all, trigger circuit behavior like before
    const fulfilledCount = results.filter(r => r.status === 'fulfilled').length;
    if (fulfilledCount === 0) {
      try { this.circuitBreaker.recordFailure(); } catch {}
      throw new Error('ALL_SOURCES_FAILED: No valid oracle data. Disbursement halted.');
    }

    // record success (at least some sources OK)
    try { this.circuitBreaker.recordSuccess(); } catch {}

    // Step 2: process peg (Category C)
    let peg = 1.0;
    if (catC.length > 0) {
      const pegValues = catC.map(c => c.value);
      const pegMedian = this.calculateMedian(pegValues);
      if (pegMedian >= 0.995 && pegMedian <= 1.005) {
        peg = pegMedian;
      } else {
        this.emitAlert('peg_deviation', { pegMedian, message: 'Peg deviates >0.5% from 1.0' });
        peg = pegMedian;
      }
    } else {
      // fallback
      peg = 1.0;
    }

    // Step 3 & 4: process Category A and B with outlier removal and weighted median
    const processCategory = (items: { name: string; value: number; source: OracleSource }[]) => {
      const simple = items.map(i => ({ name: i.name, value: i.value }));
      let valid = simple;
      let outliers: string[] = [];
      if (simple.length >= (outlierMethod === 'iqr' ? 3 : 2)) {
        if (outlierMethod === 'iqr') {
          const r = this.detectOutliersIQR(simple);
          valid = r.valid;
          outliers = r.outliers;
        } else {
          const r = this.detectOutliersThreshold(simple, outlierThreshold / 100);
          valid = r.valid;
          outliers = r.outliers;
        }
      }
      return { valid, outliers };
    };

    const aResult = processCategory(catA);
    const bResult = processCategory(catB);

    if (aResult.outliers.length > 0) droppedSources.push(...aResult.outliers.map(o => `OUTLIER_A: ${o}`));
    if (bResult.outliers.length > 0) droppedSources.push(...bResult.outliers.map(o => `OUTLIER_B: ${o}`));

    const aValid = catA.filter(c => aResult.valid.find(v => v.name === c.name));
    const bValid = catB.filter(c => bResult.valid.find(v => v.name === c.name));

    // Step 5: normalize Category A by peg and combine with Category B
    const combinedItems: { value: number; weight: number; name: string }[] = [];

    // helper to resolve weight
    const resolveWeight = (src: OracleSource) => {
      if (typeof src.weight === 'number') return src.weight;
      // fallbacks by category (default to 'A')
      const cat = (src.category ?? 'A');
      if (cat === 'A') return this.envService.get('ORACLE_WEIGHT_BANK') ?? this.envService.get('ORACLE_WEIGHT_AGGREGATOR') ?? 3;
      if (cat === 'B') return this.envService.get('ORACLE_WEIGHT_CRYPTO_DIRECT') ?? 2.5;
      return this.envService.get('ORACLE_WEIGHT_AGGREGATOR') ?? 1.5;
    };

    // Category A: USD->VND * peg
    for (const s of aValid) {
      combinedItems.push({ value: s.value * peg, weight: resolveWeight(s.source), name: s.name });
    }

    // Category B: USDC->VND direct
    for (const s of bValid) {
      combinedItems.push({ value: s.value, weight: resolveWeight(s.source), name: s.name });
    }

    // Minimum consensus check
    if (combinedItems.length < minValidSources) {
      this.emitAlert('insufficient_consensus', { available: combinedItems.length, required: minValidSources });
      try { this.circuitBreaker.recordFailure(); } catch {}
      throw new Error('INSUFFICIENT_CONSENSUS: Not enough valid sources to produce a safe rate');
    }

    // Cross-group check: compare medians of A and B (after peg applied)
    if (aValid.length > 0 && bValid.length > 0) {
      const aMedian = this.calculateMedian(aValid.map(v => v.value)) * peg;
      const bMedian = this.calculateMedian(bValid.map(v => v.value));
      const diff = Math.abs(aMedian - bMedian) / ((aMedian + bMedian) / 2);
      if (diff > crossGroupMaxDiff) {
        this.emitAlert('cross_group_divergence', { aMedian, bMedian, diff });
      }
    }

    // Compute weighted median
    const wmItems = combinedItems.map(i => ({ value: i.value, weight: i.weight }));
    const finalRateRaw = this.weightedMedian(wmItems);
    let finalRate = finalRateRaw * (safetySpread ?? 0.995);
    // Rate change guard vs cached
    let method: OracleResult['method'] = 'weighted_median';
    if (this.cache) {
      const prev = this.cache.rate;
      const change = Math.abs(finalRate - prev) / prev;
      if (change > rateChangeGuard) {
        this.emitAlert('rate_change_guard', { previous: prev, proposed: finalRate, change });
        // If change is very large (>10%), fail safe and halt
        if (change > 0.10) {
          throw new Error('RATE_CHANGE_REQUIRES_CONFIRMATION');
        }
        // Otherwise warn and invalidate cache so next caller may re-check
        console.warn('[FX Oracle] Large rate change detected, invalidating cache for re-check', { previous: prev, proposed: finalRate, change });
        this.invalidateCache();
        method = 'require_confirmation';
      }
    }

    if (finalRate < boundsMin || finalRate > boundsMax) {
      throw new Error('[FX Oracle] Final rate out of safe bounds after spread. Disbursement halted.');
    }

    const usedSources = combinedItems.map(i => i.name);

    const result: OracleResult = {
      rate: Math.floor(finalRate),
      rawRates,
      usedSources,
      droppedSources,
      cachedAt: new Date(),
      method,
    };

    this.cache = result;

    console.log('----------------------------------------------------');
    console.log('[FX Oracle SEP-38] Execution Log');
    console.log(`- Peg used: ${peg}`);
    console.log(`- Raw Rates Fetched:`, rawRates);
    console.log(`- Dropped Sources:`, droppedSources);
    console.log(`- Valid Sources Used:`, usedSources);
    console.log(`- Calculation Method: ${method} of [${wmItems.map(i => i.value).join(', ')}]`);
    console.log(`- FINAL Safe Rate: ${result.rate} VND/USDC`);
    console.log('----------------------------------------------------');

    return result;
  }

  invalidateCache(): void {
    this.cache = null;
    console.log('[FX Oracle] Cache invalidated.');
  }

  getCircuitBreakerState(): string {
    try { return this.circuitBreaker.getState(); } catch { return 'UNKNOWN'; }
  }

  resetCircuitBreaker(): void {
    try { this.circuitBreaker.reset(); } catch { /* ignore */ }
  }
}
