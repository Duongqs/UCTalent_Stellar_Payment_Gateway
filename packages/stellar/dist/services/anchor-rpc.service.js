"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnchorRpcService = void 0;
const common_1 = require("@nestjs/common");
const axios_1 = __importDefault(require("axios"));
let AnchorRpcService = class AnchorRpcService {
    constructor() {
        this.platformUrl = process.env.ANCHOR_PLATFORM_URL || process.env.PLATFORM_SERVER_URL || 'http://localhost:8085';
    }
    async patchTransaction(id, updates) {
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
    async notifyOnchainFundsReceived(transactionId, amount_in, stellar_transaction_id) {
        return this.patchTransaction(transactionId, {
            status: 'pending_receiver',
            stellar_transaction_id,
            amount_in: {
                amount: amount_in,
                asset: `stellar:USDC:${process.env.USDC_ISSUER || 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5'}`
            }
        });
    }
    async notifyOffchainFundsPending(transactionId, external_transaction_id) {
        return this.patchTransaction(transactionId, {
            status: 'pending_external',
            external_transaction_id
        });
    }
    async notifyOffchainFundsAvailable(transactionId, external_transaction_id) {
        return this.patchTransaction(transactionId, {
            status: 'completed',
            external_transaction_id
        });
    }
    async notifyTransactionError(transactionId, message) {
        return this.patchTransaction(transactionId, {
            status: 'error',
            message
        });
    }
};
exports.AnchorRpcService = AnchorRpcService;
exports.AnchorRpcService = AnchorRpcService = __decorate([
    (0, common_1.Injectable)()
], AnchorRpcService);
//# sourceMappingURL=anchor-rpc.service.js.map