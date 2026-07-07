import { rpc } from '@stellar/stellar-sdk';
export declare class StellarService {
    private rpcUrl;
    private rpcServer;
    getRpcServer(): rpc.Server;
    toNative(scValOrBase64: any): any;
    verifyTransaction(txHash: string): Promise<{
        success: boolean;
        status: string;
    }>;
    faucet(destinationAddress: string): Promise<string>;
    sponsorTransaction(innerXdr: string): Promise<string>;
}
