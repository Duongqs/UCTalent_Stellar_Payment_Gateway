export interface OracleResult {
    rate: number;
    rawRates: Record<string, number | null>;
    usedSources: string[];
    droppedSources: string[];
    cachedAt: Date;
    method: 'median' | 'single';
}
export declare function getSafeFxRate(): Promise<OracleResult>;
export declare function invalidateCache(): void;
export declare function getCircuitBreakerState(): string;
export declare function resetCircuitBreaker(): void;
