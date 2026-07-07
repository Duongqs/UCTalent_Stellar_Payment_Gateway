"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnchorRpcService = void 0;
const axios_1 = __importDefault(require("axios"));
class AnchorRpcService {
    static async patchTransaction(id, updates) {
        try {
            const response = await axios_1.default.patch(`${this.platformUrl}/transactions`, {
                records: [
                    {
                        transaction: {
                            id,
                            ...updates
                        }
                    }
                ]
            }, {
                headers: { 'Content-Type': 'application/json' },
                timeout: 10000,
            });
            return response.data;
        }
        catch (error) {
            console.error(`Error in Anchor Platform API [PATCH /transactions]:`, error.response?.data || error.message);
            throw error;
        }
    }
    static async notifyOnchainFundsReceived(transactionId, amount_in, stellar_transaction_id) {
        return this.patchTransaction(transactionId, {
            status: 'pending_receiver',
            stellar_transaction_id,
            amount_in: {
                amount: amount_in,
                asset: `stellar:USDC:${process.env.USDC_ISSUER || 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5'}`
            }
        });
    }
    static async notifyOffchainFundsPending(transactionId, external_transaction_id) {
        return this.patchTransaction(transactionId, {
            status: 'pending_external',
            external_transaction_id
        });
    }
    static async notifyOffchainFundsAvailable(transactionId, external_transaction_id) {
        return this.patchTransaction(transactionId, {
            status: 'completed',
            external_transaction_id
        });
    }
    static async notifyTransactionError(transactionId, message) {
        return this.patchTransaction(transactionId, {
            status: 'error',
            message
        });
    }
}
exports.AnchorRpcService = AnchorRpcService;
AnchorRpcService.platformUrl = process.env.ANCHOR_PLATFORM_URL || process.env.PLATFORM_SERVER_URL || 'http://localhost:8085';
//# sourceMappingURL=anchor-rpc.service.js.map