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
    getReady(): unknown;
}
