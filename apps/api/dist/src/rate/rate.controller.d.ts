import { OracleService } from '@uc/banking';
import { FirmQuoteService, AuditLogService } from '@uc/core';
export declare class RateController {
    private readonly firmQuoteService;
    private readonly oracleService;
    private readonly auditLog;
    constructor(firmQuoteService: FirmQuoteService, oracleService: OracleService, auditLog: AuditLogService);
    getInfo(): Promise<{
        assets: ({
            asset: string;
            sell_delivery_methods: {
                name: string;
                description: string;
            }[];
            buy_delivery_methods: {
                name: string;
                description: string;
            }[];
        } | {
            asset: string;
            sell_delivery_methods?: undefined;
            buy_delivery_methods?: undefined;
        })[];
    }>;
    getRate(type?: string, sell_asset?: string, buy_asset?: string, sell_amount?: string, buy_amount?: string, context?: string, buy_delivery_method?: string): Promise<{
        rate: any;
    }>;
}
