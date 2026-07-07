import { AnchorRpcService } from '@uc/stellar';
import { NinePayGatewayService, NinePayMockService, OracleService } from '@uc/banking';
export declare class DisbursementPollerService {
    private readonly anchorRpc;
    private readonly ninePayGateway;
    private readonly ninePayMock;
    private readonly oracleService;
    private platformUrl;
    private isPolling;
    constructor(anchorRpc: AnchorRpcService, ninePayGateway: NinePayGatewayService, ninePayMock: NinePayMockService, oracleService: OracleService);
    pollPendingTransactions(): Promise<void>;
    private processTransaction;
    private haltForMissingInfo;
}
