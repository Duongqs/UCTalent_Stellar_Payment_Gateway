import { AnchorRpcService } from '@uc/stellar';
import { EnvService } from '@uc/core';
export declare class NinePayMockService {
    private readonly envService;
    private readonly anchorRpcService;
    constructor(envService: EnvService, anchorRpcService: AnchorRpcService);
    simulateDisbursement(transactionId: string, amount: number, invoiceNo: string, external_transaction_id: string): Promise<void>;
}
