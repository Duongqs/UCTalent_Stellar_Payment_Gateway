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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Sep31Controller = void 0;
const common_1 = require("@nestjs/common");
const stellar_1 = require("@uc/stellar");
const core_1 = require("@uc/core");
const banking_1 = require("@uc/banking");
const initiate_disbursement_dto_1 = require("./dtos/initiate-disbursement.dto");
const anchor_webhook_guard_1 = require("./guards/anchor-webhook.guard");
const crypto_1 = require("crypto");
let Sep31Controller = class Sep31Controller {
    sep31CoreService;
    sep31Service;
    firmQuoteService;
    bankVaultService;
    constructor(sep31CoreService, sep31Service, firmQuoteService, bankVaultService) {
        this.sep31CoreService = sep31CoreService;
        this.sep31Service = sep31Service;
        this.firmQuoteService = firmQuoteService;
        this.bankVaultService = bankVaultService;
    }
    async getInfo() {
        return {
            receive: {
                USDC: {
                    enabled: true,
                    fee_fixed: 0,
                    fee_percent: 0,
                    min_amount: 1,
                    max_amount: 1000000,
                    quotes_supported: true,
                    quotes_required: true,
                },
            },
        };
    }
    async initiateDisbursement(body) {
        const { amount, sender_id, receiver_id, quote_id, idempotency_key } = body;
        if (quote_id) {
            const quote = await this.firmQuoteService.findById(quote_id);
            if (!quote) {
                throw new common_1.BadRequestException({ error: 'quote_not_found', message: 'Quote not found' });
            }
            if (quote.expiresAt && new Date(quote.expiresAt) < new Date()) {
                throw new common_1.BadRequestException({ error: 'quote_expired', message: 'Quote expired' });
            }
            if (quote.usedAt) {
                throw new common_1.ConflictException({ error: 'quote_already_used', message: 'Quote already used' });
            }
        }
        const tempId = (0, crypto_1.randomUUID)();
        try {
            const tx = this.sep31CoreService.create({
                id: tempId,
                amountIn: amount,
                assetCode: 'USDC',
                senderId: sender_id,
                receiverId: receiver_id,
                status: 'processing_lock',
                idempotencyKey: idempotency_key || undefined,
                distributionId: idempotency_key || undefined,
                quoteId: quote_id || undefined,
            });
            await this.sep31CoreService.insert(tx);
        }
        catch (error) {
            const isUniqueConstraint = error.code === '23505' ||
                (error.message && error.message.includes('UNIQUE constraint failed'));
            if (isUniqueConstraint && idempotency_key) {
                const row = await this.sep31CoreService.findByIdempotencyKey(idempotency_key);
                if (row) {
                    if (row.status === 'processing_lock') {
                        console.log(`[SEP31] Concurrent idempotency hit for key ${idempotency_key} (still processing).`);
                        throw new common_1.ConflictException('Transaction is currently processing. Please wait.');
                    }
                    if (row.status === 'error') {
                        console.log(`[SEP31] Concurrent idempotency hit for key ${idempotency_key} (failed ambiguously).`);
                        throw new common_1.ConflictException('Previous attempt failed ambiguously. Please contact support or use a new transaction.');
                    }
                    console.log(`[SEP31] Concurrent idempotency hit for key ${idempotency_key}. Returning existing tx.`);
                    return {
                        success: true,
                        transactionId: row.id,
                        status: row.status,
                    };
                }
            }
            throw error;
        }
        console.log(`[SEP31] Initiating disbursement for ${amount} USDC to receiver ${receiver_id}`);
        let receiver_routing_number = 'mock';
        let receiver_account_number = 'mock';
        try {
            const profile = await this.bankVaultService.getProfile(receiver_id);
            if (profile && profile.isVerified) {
                const fullProfile = await this.bankVaultService.hydrateBankInfo(profile.beneficiaryRefId);
                receiver_routing_number = fullProfile.bank_code;
                receiver_account_number = fullProfile.account_number;
            }
        }
        catch (e) {
            console.warn(`[SEP31] Could not fetch real bank profile for ${receiver_id}, using mock`);
        }
        let transactionResponse;
        try {
            transactionResponse = await this.sep31Service.createTransaction({
                amount,
                asset_code: 'USDC',
                sender_id,
                receiver_id,
                receiver_routing_number,
                receiver_account_number,
            });
        }
        catch (apError) {
            const msg = apError.message || '';
            const code = apError.code || '';
            const isAmbiguous = msg.includes('timeout') ||
                msg.includes('socket hang up') ||
                code === 'ECONNABORTED' ||
                code === 'ECONNRESET';
            if (isAmbiguous) {
                await this.sep31CoreService.update(tempId, {
                    status: 'error',
                    errorMessage: 'Ambiguous timeout during AP call',
                });
                throw new common_1.BadGatewayException({
                    error: 'ambiguous_timeout',
                    message: 'Transaction is in an ambiguous state due to network timeout. Please contact support.',
                });
            }
            else {
                await this.sep31CoreService.delete(tempId);
                if (msg.includes('CUSTOMER_NEEDS_INFO')) {
                    throw new common_1.BadRequestException({ error: 'customer_info_needed' });
                }
                if (msg.includes('QUOTE_EXPIRED')) {
                    throw new common_1.BadRequestException({ error: 'quote_expired' });
                }
                throw new common_1.BadRequestException({ error: 'ap_error', message: msg });
            }
        }
        const transactionId = transactionResponse.id;
        console.log(`[SEP31] Transaction created on AP. ID: ${transactionId}`);
        await this.sep31CoreService.updateWithQueryBuilder(tempId, {
            id: transactionId,
            status: 'pending_sender',
        });
        return {
            success: true,
            transactionId,
            status: 'pending_sender',
            stellar_account: transactionResponse.stellar_account,
            stellar_memo: transactionResponse.stellar_memo,
            stellar_memo_type: transactionResponse.stellar_memo_type,
        };
    }
};
exports.Sep31Controller = Sep31Controller;
__decorate([
    (0, common_1.Get)('info'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], Sep31Controller.prototype, "getInfo", null);
__decorate([
    (0, common_1.Post)('initiate'),
    (0, common_1.UseGuards)(anchor_webhook_guard_1.AnchorWebhookGuard),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [initiate_disbursement_dto_1.InitiateDisbursementDto]),
    __metadata("design:returntype", Promise)
], Sep31Controller.prototype, "initiateDisbursement", null);
exports.Sep31Controller = Sep31Controller = __decorate([
    (0, common_1.Controller)('sep31'),
    __metadata("design:paramtypes", [core_1.Sep31CoreService,
        stellar_1.Sep31TransactionService,
        core_1.FirmQuoteService,
        banking_1.BankVaultService])
], Sep31Controller);
//# sourceMappingURL=sep31.controller.js.map