import { AnchorRpcService } from '@uc/stellar';
export declare class IpnController {
    private readonly anchorRpc;
    constructor(anchorRpc: AnchorRpcService);
    handleIpn(body: {
        result?: string;
        checksum?: string;
    }): Promise<{
        message: string;
    }>;
}
