import { Sep31TransactionService } from '@uc/stellar';
import { Sep31CoreService, FirmQuoteService, EnvService } from '@uc/core';
import { BankVaultService } from '@uc/banking';
import { InitiateDisbursementDto } from './dtos/initiate-disbursement.dto';
import { PostTransactionDto } from './dtos/post-transaction.dto';
export declare class Sep31Controller {
    private readonly sep31CoreService;
    private readonly sep31Service;
    private readonly firmQuoteService;
    private readonly bankVaultService;
    private readonly envService;
    constructor(sep31CoreService: Sep31CoreService, sep31Service: Sep31TransactionService, firmQuoteService: FirmQuoteService, bankVaultService: BankVaultService, envService: EnvService);
    getInfo(): Promise<{
        receive: {
            USDC: {
                funding_methods: string[];
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
    createTransaction(body: PostTransactionDto): Promise<{
        id: any;
        stellar_account_id: any;
        stellar_memo_type: any;
        stellar_memo: any;
    }>;
    getTransaction(id: string): Promise<{
        transaction: {
            id: string;
            status: string;
            amount_in: string;
            amount_in_asset: string;
            amount_out: string | undefined;
            amount_out_asset: string;
            stellar_account_id: string;
            stellar_memo: string;
            stellar_memo_type: string;
            stellar_transaction_id: string;
            external_transaction_id: string;
            started_at: string | undefined;
            updated_at: string | undefined;
        };
    }>;
    patchTransaction(id: string, body: any): Promise<{
        success: boolean;
    }>;
    putTransactionCallback(id: string, body: {
        url: string;
    }): Promise<{
        success: boolean;
    }>;
}
