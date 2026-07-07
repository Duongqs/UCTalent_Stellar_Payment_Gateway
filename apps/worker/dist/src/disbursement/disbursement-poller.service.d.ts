export declare class DisbursementPollerService {
    private platformUrl;
    private isPolling;
    pollPendingTransactions(): Promise<void>;
    private processTransaction;
    private haltForMissingInfo;
}
