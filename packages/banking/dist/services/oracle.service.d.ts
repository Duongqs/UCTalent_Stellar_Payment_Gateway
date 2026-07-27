import { EnvService } from '@uc/core';
import { OracleSourceRegistry } from '../oracle-sources/oracle-source.registry';
export interface OracleResult {
    rate: number;
    rawRates: Record<string, number | null>;
    usedSources: string[];
    droppedSources: string[];
    cachedAt: Date;
    method: 'median' | 'single';
}
export declare class OracleService {
    private readonly envService;
    private readonly registry;
    private cache;
    private circuitBreaker;
    constructor(envService: EnvService, registry: OracleSourceRegistry);
    private calculateMedian;
    private detectOutliersThreshold;
    private detectOutliersIQR;
    getSafeFxRate(): Promise<OracleResult>;
    invalidateCache(): void;
    getCircuitBreakerState(): string;
    resetCircuitBreaker(): void;
}
