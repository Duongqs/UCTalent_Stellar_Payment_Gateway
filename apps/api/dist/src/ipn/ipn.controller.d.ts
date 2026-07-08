import { AnchorRpcService } from '@uc/stellar';
import { Sep31CoreService, EnvService } from '@uc/core';
import { IpnDto } from './dtos/ipn.dto';
export declare class IpnController {
    private readonly sep31CoreService;
    private readonly anchorRpc;
    private readonly envService;
    constructor(sep31CoreService: Sep31CoreService, anchorRpc: AnchorRpcService, envService: EnvService);
    handleIpn(body: IpnDto): Promise<{
        message: string;
    }>;
}
