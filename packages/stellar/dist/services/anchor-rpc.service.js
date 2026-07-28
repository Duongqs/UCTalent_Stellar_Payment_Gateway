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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnchorRpcService = void 0;
const common_1 = require("@nestjs/common");
const axios_1 = __importDefault(require("axios"));
const core_1 = require("@uc/core");
let AnchorRpcService = class AnchorRpcService {
    constructor(envService) {
        this.envService = envService;
    }
    get platformUrl() {
        const url = this.envService.get('PLATFORM_SERVER_URL') || this.envService.get('ANCHOR_PLATFORM_URL');
        if (!url)
            throw new Error('PLATFORM_SERVER_URL is missing');
        return url;
    }
    async patchTransaction(id, updates, retryCount = 0) {
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
            const errorMsg = error.response?.data?.error || error.message;
            if (retryCount < 3 &&
                errorMsg &&
                errorMsg.includes('modified by another request')) {
                console.warn(`[AnchorRpcService] Concurrency error on PATCH /transactions for ${id}. Retrying (${retryCount + 1}/3) in 500ms...`);
                await new Promise(resolve => setTimeout(resolve, 500));
                return this.patchTransaction(id, updates, retryCount + 1);
            }
            if ((error.code === 'ECONNREFUSED' || error.code === 'ECONNABORTED' || (error.message && (error.message.includes('ECONNREFUSED') || error.message.includes('ECONNABORTED')))) &&
                this.envService.get('USE_MOCK_IPN') === 'true') {
                console.warn(`[Mock] Skipping Anchor Platform PATCH /transactions for ${id} due to mock mode.`);
                return { mock: true };
            }
            console.error(`Error in Anchor Platform API [PATCH /transactions]:`, error.response?.data || error.message, error);
            throw error;
        }
    }
    async notifyOnchainFundsReceived(transactionId, amount_in, stellar_transaction_id) {
        const usdcIssuer = this.envService.get('USDC_ISSUER');
        return this.patchTransaction(transactionId, {
            status: 'pending_receiver',
            stellar_transaction_id,
            amount_in: {
                amount: amount_in,
                asset: `stellar:USDC:${usdcIssuer}`
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
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [core_1.EnvService])
], AnchorRpcService);
//# sourceMappingURL=anchor-rpc.service.js.map