import { OracleService } from '@uc/banking';
export declare class RateController {
    private readonly oracleService;
    constructor(oracleService: OracleService);
    getRate(type?: string, sell_asset?: string, buy_asset?: string, sell_amount?: string, buy_amount?: string, context?: string, buy_delivery_method?: string): Promise<{
        rate: any;
    }>;
    getQuote(id: string): Promise<{
        id: any;
        price: string;
        sell_asset: any;
        buy_asset: any;
        sell_amount: any;
        buy_amount: any;
        expires_at: any;
        fee: {
            total: string;
            asset: any;
        };
    }>;
}
