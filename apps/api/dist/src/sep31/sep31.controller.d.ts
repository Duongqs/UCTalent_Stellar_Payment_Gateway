import { Sep31TransactionService } from '@uc/stellar';
import { Sep31CoreService, FirmQuoteService } from '@uc/core';
import { BankVaultService } from '@uc/banking';
import { InitiateDisbursementDto } from './dtos/initiate-disbursement.dto';
export declare class Sep31Controller {
    private readonly sep31CoreService;
    private readonly sep31Service;
    private readonly firmQuoteService;
    private readonly bankVaultService;
    constructor(sep31CoreService: Sep31CoreService, sep31Service: Sep31TransactionService, firmQuoteService: FirmQuoteService, bankVaultService: BankVaultService);
    getInfo(): Promise<{
        receive: {
            USDC: {
                enabled: boolean;
                fee_fixed: number;
                fee_percent: number;
                min_amount: number;
                max_amount: number;
                quotes_supported: boolean;
                quotes_required: boolean;
            };
        };
    }>;
    initiateDisbursement(body: InitiateDisbursementDto): Promise<{
        success: boolean;
        transactionId: string;
        status: string;
        stellar_account?: undefined;
        stellar_memo?: undefined;
        stellar_memo_type?: undefined;
    } | {
        success: boolean;
        transactionId: any;
        status: string;
        stellar_account: any;
        stellar_memo: any;
        stellar_memo_type: any;
    }>;
}
