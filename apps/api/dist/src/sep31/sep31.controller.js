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
const crypto_1 = require("crypto");
let Sep31Controller = class Sep31Controller {
    sep31Service;
    constructor(sep31Service) {
        this.sep31Service = sep31Service;
    }
    async initiateDisbursement(body) {
        const { amount, sender_id, receiver_id, quote_id, idempotency_key } = body;
        if (!amount || !sender_id || !receiver_id) {
            throw new common_1.BadRequestException('Missing required fields');
        }
        const tempId = (0, crypto_1.randomUUID)();
        if (idempotency_key) {
            try {
                await (0, core_1.query)(`INSERT INTO sep31_transactions (id, amount_in, asset_code, sender_id, receiver_id, status, idempotency_key, quote_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, [tempId, amount, 'USDC', sender_id, receiver_id, 'processing_lock', idempotency_key, quote_id || null]);
            }
            catch (error) {
                if (error.code === '23505') {
                    const existingTxList = await (0, core_1.queryAll)('SELECT id, status FROM sep31_transactions WHERE idempotency_key = $1', [idempotency_key]);
                    if (existingTxList.length > 0) {
                        const row = existingTxList[0];
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
        }
        else {
            await (0, core_1.query)(`INSERT INTO sep31_transactions (id, amount_in, asset_code, sender_id, receiver_id, status, quote_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, [tempId, amount, 'USDC', sender_id, receiver_id, 'processing_lock', quote_id || null]);
        }
        console.log(`[SEP31] Initiating disbursement for ${amount} USDC to receiver ${receiver_id}`);
        let transactionResponse;
        try {
            transactionResponse = await this.sep31Service.createTransaction({
                amount,
                asset_code: 'USDC',
                sender_id,
                receiver_id,
                quote_id,
            });
        }
        catch (apError) {
            const msg = apError.message || '';
            const code = apError.code || '';
            const isAmbiguous = msg.includes('timeout') || msg.includes('socket hang up') || code === 'ECONNABORTED' || code === 'ECONNRESET';
            if (isAmbiguous) {
                await (0, core_1.query)(`UPDATE sep31_transactions SET status = 'error', error_message = $1, updated_at = now() WHERE id = $2`, ['Ambiguous timeout during AP call', tempId]);
                throw new common_1.BadGatewayException({
                    error: 'ambiguous_timeout',
                    message: 'Transaction is in an ambiguous state due to network timeout. Please contact support.'
                });
            }
            else {
                await (0, core_1.query)(`DELETE FROM sep31_transactions WHERE id = $1`, [tempId]);
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
        await (0, core_1.query)(`UPDATE sep31_transactions 
       SET id = $1, status = 'pending_sender', updated_at = now()
       WHERE id = $2`, [transactionId, tempId]);
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
    (0, common_1.Post)('initiate'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], Sep31Controller.prototype, "initiateDisbursement", null);
exports.Sep31Controller = Sep31Controller = __decorate([
    (0, common_1.Controller)('sep31'),
    __metadata("design:paramtypes", [stellar_1.Sep31TransactionService])
], Sep31Controller);
//# sourceMappingURL=sep31.controller.js.map