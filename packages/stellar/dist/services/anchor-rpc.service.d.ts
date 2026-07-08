import { EnvService } from '@uc/core';
export declare class AnchorRpcService {
    private readonly envService;
    constructor(envService: EnvService);
    private get platformUrl();
    private patchTransaction;
    notifyOnchainFundsReceived(transactionId: string, amount_in: string, stellar_transaction_id: string): Promise<any>;
    notifyOffchainFundsPending(transactionId: string, external_transaction_id: string): Promise<any>;
    notifyOffchainFundsAvailable(transactionId: string, external_transaction_id: string): Promise<any>;
    notifyTransactionError(transactionId: string, message: string): Promise<any>;
}
