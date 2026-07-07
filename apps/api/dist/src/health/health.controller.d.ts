export declare class HealthController {
    getHealth(): Promise<{
        status: string;
        checks: {
            database: {
                status: string;
                latency_ms: number;
            };
            oracle_circuit_breaker: string;
        };
    }>;
}
