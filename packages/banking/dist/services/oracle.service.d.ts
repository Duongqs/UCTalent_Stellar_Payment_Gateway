import { EnvService } from '@uc/core';
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
    private cache;
    private circuitBreaker;
    constructor(envService: EnvService);
    private sources;
    private calculateMedian;
    private detectOutliers;
    getSafeFxRate(): Promise<OracleResult>;
    invalidateCache(): void;
    getCircuitBreakerState(): string;
    resetCircuitBreaker(): void;
}
