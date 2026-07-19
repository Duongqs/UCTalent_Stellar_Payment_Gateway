import { AnchorRpcService } from '@uc/stellar';
import { Sep31CoreService, EnvService } from '@uc/core';
import { NinePayGatewayService } from '@uc/banking';
import { IpnDto } from './dtos/ipn.dto';
export declare class IpnController {
    private readonly sep31CoreService;
    private readonly anchorRpc;
    private readonly envService;
    private readonly ninePayGatewayService;
    private readonly requestCounts;
    constructor(sep31CoreService: Sep31CoreService, anchorRpc: AnchorRpcService, envService: EnvService, ninePayGatewayService: NinePayGatewayService);
    handleIpn(request: any, body: IpnDto): Promise<{
        message: string;
    }>;
    private sendBackendWebhook;
    pollPendingExternal(): Promise<void>;
}
