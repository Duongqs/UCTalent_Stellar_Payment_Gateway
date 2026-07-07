import { rpc } from '@stellar/stellar-sdk';
export declare class StellarService {
    private static rpcUrl;
    private static rpcServer;
    static getRpcServer(): rpc.Server;
    static toNative(scValOrBase64: any): any;
    static verifyTransaction(txHash: string): Promise<{
        success: boolean;
        status: string;
    }>;
    static faucet(destinationAddress: string): Promise<string>;
    static sponsorTransaction(innerXdr: string): Promise<string>;
}
