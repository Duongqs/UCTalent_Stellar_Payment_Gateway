export declare class Sep31Controller {
    initiateDisbursement(body: {
        amount?: string;
        sender_id?: string;
        receiver_id?: string;
        quote_id?: string;
        idempotency_key?: string;
    }): Promise<{
        success: boolean;
        transactionId: any;
        status: any;
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
