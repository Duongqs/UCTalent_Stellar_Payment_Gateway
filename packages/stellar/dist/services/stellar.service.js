"use strict";
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.StellarService = void 0;
const stellar_sdk_1 = require("@stellar/stellar-sdk");
class StellarService {
    static getRpcServer() {
        return this.rpcServer;
    }
    static toNative(scValOrBase64) {
        try {
            let scVal = scValOrBase64;
            if (typeof scVal === 'string') {
                scVal = stellar_sdk_1.xdr.ScVal.fromXDR(scVal, 'base64');
            }
            else if (scVal && scVal.xdr) {
                scVal = stellar_sdk_1.xdr.ScVal.fromXDR(scVal.xdr, 'base64');
            }
            return (0, stellar_sdk_1.scValToNative)(scVal);
        }
        catch (err) {
            console.warn('[Stellar] Failed to parse ScVal:', err.message);
            return null;
        }
    }
    static async verifyTransaction(txHash) {
        try {
            const txStatus = await this.rpcServer.getTransaction(txHash);
            return {
                success: txStatus.status === 'SUCCESS',
                status: txStatus.status,
            };
        }
        catch (err) {
            console.warn(`[Stellar] Could not query tx ${txHash} on-chain:`, err.message);
            return { success: false, status: 'UNKNOWN' };
        }
    }
    static async faucet(destinationAddress) {
        const horizonUrl = 'https://horizon-testnet.stellar.org';
        const server = new stellar_sdk_1.Horizon.Server(horizonUrl);
        const fundingSecret = process.env.FUNDING_SECRET || 'SCQMGZP23PYPUUG652FNE4M44O5CB3NV3CPEXXVF7H6EJJ3SCUJZL6HO';
        const funderKeypair = stellar_sdk_1.Keypair.fromSecret(fundingSecret);
        const funderAccount = await server.loadAccount(funderKeypair.publicKey());
        const usdcAsset = new stellar_sdk_1.Asset('USDC', process.env.USDC_ISSUER || 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5');
        const txBuilder = new stellar_sdk_1.TransactionBuilder(funderAccount, {
            fee: '15000',
            networkPassphrase: process.env.NETWORK_PASSPHRASE || stellar_sdk_1.Networks.TESTNET,
        });
        txBuilder.addOperation(stellar_sdk_1.Operation.pathPaymentStrictReceive({
            sendAsset: stellar_sdk_1.Asset.native(),
            sendMax: '10000',
            destination: destinationAddress,
            destAsset: usdcAsset,
            destAmount: '2000',
            path: []
        }));
        const tx = txBuilder.setTimeout(300).build();
        tx.sign(funderKeypair);
        const result = await server.submitTransaction(tx);
        if (!result.hash) {
            throw new Error('No transaction hash returned from horizon submission');
        }
        return result.hash;
    }
    static async sponsorTransaction(innerXdr) {
        const anchorSigningKey = process.env.ANCHOR_SIGNING_KEY;
        if (!anchorSigningKey) {
            return innerXdr;
        }
        try {
            const feeWalletKeypair = stellar_sdk_1.Keypair.fromSecret(anchorSigningKey);
            const passphrase = process.env.NETWORK_PASSPHRASE || stellar_sdk_1.Networks.TESTNET;
            const innerTx = stellar_sdk_1.TransactionBuilder.fromXDR(innerXdr, passphrase);
            if ('innerTransaction' in innerTx) {
                throw new Error('Transaction is already fee-bumped');
            }
            const feeBumpTx = stellar_sdk_1.TransactionBuilder.buildFeeBumpTransaction(feeWalletKeypair, '10000', innerTx, passphrase);
            feeBumpTx.sign(feeWalletKeypair);
            return feeBumpTx.toXDR();
        }
        catch (err) {
            console.error('[Stellar] Fee bump sponsorship failed:', err.message);
            throw new Error(`sponsor_failed: ${err.message}`);
        }
    }
}
exports.StellarService = StellarService;
_a = StellarService;
StellarService.rpcUrl = process.env.SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org';
StellarService.rpcServer = new stellar_sdk_1.rpc.Server(_a.rpcUrl);
//# sourceMappingURL=stellar.service.js.map