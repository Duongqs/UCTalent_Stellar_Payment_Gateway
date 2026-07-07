import { AnchorRpcService } from '@uc/stellar';
export declare class NinePayMockService {
    private readonly anchorRpcService;
    constructor(anchorRpcService: AnchorRpcService);
    simulateDisbursement(transactionId: string, amount: number, invoiceNo: string, external_transaction_id: string): Promise<void>;
}
