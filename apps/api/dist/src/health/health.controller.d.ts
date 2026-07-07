import { OracleService } from '@uc/banking';
export declare class HealthController {
    private readonly oracleService;
    constructor(oracleService: OracleService);
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
