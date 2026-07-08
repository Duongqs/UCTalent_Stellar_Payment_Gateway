import { rpc } from '@stellar/stellar-sdk';
import { EnvService } from '@uc/core';
export declare class StellarService {
    private readonly envService;
    private rpcServer;
    constructor(envService: EnvService);
    getRpcServer(): rpc.Server;
    toNative(scValOrBase64: any): any;
    verifyTransaction(txHash: string): Promise<{
        success: boolean;
        status: string;
    }>;
    faucet(destinationAddress: string): Promise<string>;
    sponsorTransaction(innerXdr: string): Promise<string>;
}
