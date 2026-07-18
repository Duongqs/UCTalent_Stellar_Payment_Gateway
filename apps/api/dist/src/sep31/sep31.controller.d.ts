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
    getInfo(): unknown;
    initiateDisbursement(body: InitiateDisbursementDto): unknown;
    createTransaction(body: PostTransactionDto): unknown;
    getTransaction(id: string): unknown;
    patchTransaction(id: string, body: any): unknown;
    putTransactionCallback(id: string, body: {
        url: string;
    }): unknown;
}
