export declare class AnchorRpcService {
    private static platformUrl;
    private static patchTransaction;
    static notifyOnchainFundsReceived(transactionId: string, amount_in: string, stellar_transaction_id: string): Promise<any>;
    static notifyOffchainFundsPending(transactionId: string, external_transaction_id: string): Promise<any>;
    static notifyOffchainFundsAvailable(transactionId: string, external_transaction_id: string): Promise<any>;
    static notifyTransactionError(transactionId: string, message: string): Promise<any>;
}
