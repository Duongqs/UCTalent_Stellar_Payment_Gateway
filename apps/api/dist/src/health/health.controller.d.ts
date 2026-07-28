import { OracleService } from '@uc/banking';
import { Sep31CoreService } from '@uc/core';
export declare class HealthController {
    private readonly sep31CoreService;
    private readonly oracleService;
    constructor(sep31CoreService: Sep31CoreService, oracleService: OracleService);
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
