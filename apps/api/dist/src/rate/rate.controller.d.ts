import { OracleService } from '@uc/banking';
import { FirmQuoteService, AuditLogService, EnvService } from '@uc/core';
export declare class RateController {
    private readonly firmQuoteService;
    private readonly oracleService;
    private readonly auditLog;
    private readonly envService;
    constructor(firmQuoteService: FirmQuoteService, oracleService: OracleService, auditLog: AuditLogService, envService: EnvService);
    getInfo(): unknown;
    getRate(type?: string, sell_asset?: string, buy_asset?: string, sell_amount?: string, buy_amount?: string, context?: string, buy_delivery_method?: string): unknown;
}
