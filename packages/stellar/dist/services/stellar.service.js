"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StellarService = void 0;
const stellar_sdk_1 = require("@stellar/stellar-sdk");
const common_1 = require("@nestjs/common");
const core_1 = require("@uc/core");
let StellarService = class StellarService {
    constructor(envService) {
        this.envService = envService;
        const rpcUrl = this.envService.get('SOROBAN_RPC_URL') || 'https://soroban-testnet.stellar.org';
        this.rpcServer = new stellar_sdk_1.rpc.Server(rpcUrl);
    }
    getRpcServer() {
        return this.rpcServer;
    }
    toNative(scValOrBase64) {
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
    async verifyTransaction(txHash) {
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
    async faucet(destinationAddress) {
        const horizonUrl = 'https://horizon-testnet.stellar.org';
        const server = new stellar_sdk_1.Horizon.Server(horizonUrl);
        const fundingSecret = this.envService.get('FUNDING_SECRET') || 'SCQMGZP23PYPUUG652FNE4M44O5CB3NV3CPEXXVF7H6EJJ3SCUJZL6HO';
        const funderKeypair = stellar_sdk_1.Keypair.fromSecret(fundingSecret);
        const funderAccount = await server.loadAccount(funderKeypair.publicKey());
        const usdcIssuer = this.envService.get('USDC_ISSUER') || 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
        const usdcAsset = new stellar_sdk_1.Asset('USDC', usdcIssuer);
        const networkPassphrase = this.envService.get('NETWORK_PASSPHRASE') || stellar_sdk_1.Networks.TESTNET;
        const txBuilder = new stellar_sdk_1.TransactionBuilder(funderAccount, {
            fee: '15000',
            networkPassphrase,
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
    async sponsorTransaction(innerXdr) {
        const anchorSigningKey = this.envService.get('ANCHOR_SIGNING_KEY');
        if (!anchorSigningKey) {
            return innerXdr;
        }
        try {
            const feeWalletKeypair = stellar_sdk_1.Keypair.fromSecret(anchorSigningKey);
            const networkPassphrase = this.envService.get('NETWORK_PASSPHRASE') || stellar_sdk_1.Networks.TESTNET;
            const innerTx = stellar_sdk_1.TransactionBuilder.fromXDR(innerXdr, networkPassphrase);
            if ('innerTransaction' in innerTx) {
                throw new Error('Transaction is already fee-bumped');
            }
            const feeBumpTx = stellar_sdk_1.TransactionBuilder.buildFeeBumpTransaction(feeWalletKeypair, '10000', innerTx, networkPassphrase);
            feeBumpTx.sign(feeWalletKeypair);
            return feeBumpTx.toXDR();
        }
        catch (err) {
            console.error('[Stellar] Fee bump sponsorship failed:', err.message);
            throw new Error(`sponsor_failed: ${err.message}`);
        }
    }
};
exports.StellarService = StellarService;
exports.StellarService = StellarService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [core_1.EnvService])
], StellarService);
//# sourceMappingURL=stellar.service.js.map