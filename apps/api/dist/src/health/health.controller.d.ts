import { DataSource } from 'typeorm';
import { OracleService } from '@uc/banking';
export declare class HealthController {
    private readonly dataSource;
    private readonly oracleService;
    constructor(dataSource: DataSource, oracleService: OracleService);
    getLive(): {
        status: string;
        service: string;
    };
    getReady(): Promise<{
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
