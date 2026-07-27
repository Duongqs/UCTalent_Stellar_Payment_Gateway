"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OracleService = void 0;
const common_1 = require("@nestjs/common");
const axios_1 = __importDefault(require("axios"));
const core_1 = require("@uc/core");
const oracle_source_registry_1 = require("../oracle-sources/oracle-source.registry");
var CircuitState;
(function (CircuitState) {
    CircuitState[CircuitState["CLOSED"] = 0] = "CLOSED";
    CircuitState[CircuitState["OPEN"] = 1] = "OPEN";
    CircuitState[CircuitState["HALF_OPEN"] = 2] = "HALF_OPEN";
})(CircuitState || (CircuitState = {}));
class OracleCircuitBreaker {
    constructor(envService) {
        this.envService = envService;
        this.state = CircuitState.CLOSED;
        this.consecutiveFailures = 0;
        this.lastFailureAt = null;
        this.FAILURE_THRESHOLD = 3;
        this.RECOVERY_TIMEOUT_MS = 30_000;
    }
    isOpen() {
        if (this.state !== CircuitState.OPEN)
            return false;
        if (this.lastFailureAt && Date.now() - this.lastFailureAt.getTime() > this.RECOVERY_TIMEOUT_MS) {
            this.state = CircuitState.HALF_OPEN;
            console.log('[FX Oracle] Circuit breaker → HALF_OPEN (attempting recovery)');
            return false;
        }
        return true;
    }
    recordSuccess() {
        if (this.state !== CircuitState.CLOSED) {
            console.log('[FX Oracle] Circuit breaker → CLOSED (recovered)');
        }
        this.state = CircuitState.CLOSED;
        this.consecutiveFailures = 0;
    }
    recordFailure() {
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
    getState() {
        return CircuitState[this.state];
    }
    emitAlert(type, payload) {
        console.error(`[ALERT:${type}]`, JSON.stringify(payload));
        const slackWebhook = this.envService.get('SLACK_ALERT_WEBHOOK');
        if (slackWebhook) {
            axios_1.default.post(slackWebhook, {
                text: `🚨 *${type}*\n\`\`\`${JSON.stringify(payload, null, 2)}\`\`\``,
            }).catch(() => { });
        }
    }
}
let OracleService = class OracleService {
    constructor(envService, registry) {
        this.envService = envService;
        this.registry = registry;
        this.cache = null;
        this.circuitBreaker = new OracleCircuitBreaker(this.envService);
    }
    calculateMedian(values) {
        if (values.length === 0)
            return 0;
        const sorted = [...values].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 === 0
            ? (sorted[mid - 1] + sorted[mid]) / 2
            : sorted[mid];
    }
    detectOutliersThreshold(rates, thresholdPct) {
        if (rates.length < 2)
            return { valid: rates, outliers: [] };
        const tempMedian = this.calculateMedian(rates.map(r => r.value));
        const outliers = [];
        const valid = [];
        for (const r of rates) {
            const diffPct = Math.abs(r.value - tempMedian) / tempMedian * 100;
            if (diffPct > thresholdPct) {
                outliers.push(`${r.name} (${r.value.toFixed(0)}, diff ${diffPct.toFixed(1)}%)`);
            }
            else {
                valid.push(r);
            }
        }
        return valid.length === 0 ? { valid: rates, outliers: [] } : { valid, outliers };
    }
    detectOutliersIQR(rates) {
        if (rates.length < 3)
            return { valid: rates, outliers: [] };
        const sorted = [...rates].map(r => r.value).sort((a, b) => a - b);
        const q1 = sorted[Math.floor(sorted.length * 0.25)];
        const q3 = sorted[Math.floor(sorted.length * 0.75)];
        const iqr = q3 - q1;
        const lower = q1 - 1.5 * iqr;
        const upper = q3 + 1.5 * iqr;
        const valid = [];
        const outliers = [];
        for (const r of rates) {
            if (r.value < lower || r.value > upper) {
                outliers.push(`${r.name} (${r.value.toFixed(0)}, IQR bounds: ${lower.toFixed(0)}-${upper.toFixed(0)})`);
            }
            else {
                valid.push(r);
            }
        }
        return valid.length === 0 ? { valid: rates, outliers: [] } : { valid, outliers };
    }
    async getSafeFxRate() {
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
        const results = await Promise.allSettled(activeSources.map(async (s) => ({
            name: s.name,
            value: await s.fetch(),
        })));
        const bounds = {
            MIN: this.envService.get('ORACLE_HARD_BOUND_MIN') ?? 23000,
            MAX: this.envService.get('ORACLE_HARD_BOUND_MAX') ?? 28000,
        };
        const safetySpread = this.envService.get('ORACLE_SAFETY_SPREAD') ?? 0.99;
        const minValidSources = this.envService.get('ORACLE_MIN_VALID_SOURCES') ?? 3;
        const rawRates = {};
        const successRates = [];
        const droppedSources = [];
        for (let i = 0; i < results.length; i++) {
            const result = results[i];
            const sourceName = activeSources[i].name;
            if (result.status === 'fulfilled') {
                const rate = result.value.value;
                rawRates[sourceName] = rate;
                if (rate < bounds.MIN || rate > bounds.MAX) {
                    droppedSources.push(`${sourceName} (${rate.toFixed(0)}, out of bounds)`);
                }
                else {
                    successRates.push({ name: sourceName, value: rate });
                }
            }
            else {
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
        let outliers = [];
        const outlierMethod = this.envService.get('ORACLE_OUTLIER_METHOD') ?? 'iqr';
        if (successRates.length >= minValidSources) {
            if (outlierMethod === 'iqr') {
                const iqrResult = this.detectOutliersIQR(successRates);
                valid = iqrResult.valid;
                outliers = iqrResult.outliers;
            }
            else {
                const thresholdPct = this.envService.get('ORACLE_OUTLIER_THRESHOLD_PCT') ?? 3;
                const thresholdResult = this.detectOutliersThreshold(successRates, thresholdPct);
                valid = thresholdResult.valid;
                outliers = thresholdResult.outliers;
            }
        }
        else {
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
        let method;
        let finalRate;
        if (validRates.length === 1) {
            finalRate = validRates[0];
            method = 'single';
        }
        else {
            finalRate = this.calculateMedian(validRates);
            method = 'median';
        }
        finalRate = finalRate * safetySpread;
        if (finalRate < bounds.MIN || finalRate > bounds.MAX) {
            throw new Error(`[FX Oracle] Final rate ${finalRate.toFixed(0)} out of safe bounds after spread. Disbursement halted.`);
        }
        const oracleResult = {
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
    invalidateCache() {
        this.cache = null;
        console.log('[FX Oracle] Cache invalidated.');
    }
    getCircuitBreakerState() {
        return this.circuitBreaker.getState();
    }
    resetCircuitBreaker() {
        this.circuitBreaker.state = 0;
        this.circuitBreaker.consecutiveFailures = 0;
        this.circuitBreaker.lastFailureAt = null;
    }
};
exports.OracleService = OracleService;
exports.OracleService = OracleService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [core_1.EnvService,
        oracle_source_registry_1.OracleSourceRegistry])
], OracleService);
//# sourceMappingURL=oracle.service.js.map