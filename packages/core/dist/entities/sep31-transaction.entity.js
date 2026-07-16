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
exports.Sep31TransactionEntity = void 0;
const typeorm_1 = require("typeorm");
const base_entity_1 = require("./base.entity");
let Sep31TransactionEntity = class Sep31TransactionEntity extends base_entity_1.BaseEntity {
};
exports.Sep31TransactionEntity = Sep31TransactionEntity;
__decorate([
    (0, typeorm_1.Column)({ name: 'amount_in', type: 'decimal', precision: 18, scale: 7, nullable: true }),
    __metadata("design:type", String)
], Sep31TransactionEntity.prototype, "amountIn", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'asset_code', type: 'varchar', default: 'USDC' }),
    __metadata("design:type", String)
], Sep31TransactionEntity.prototype, "assetCode", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'sender_id', type: 'varchar', nullable: true }),
    __metadata("design:type", String)
], Sep31TransactionEntity.prototype, "senderId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'receiver_id', type: 'varchar', nullable: true }),
    __metadata("design:type", String)
], Sep31TransactionEntity.prototype, "receiverId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', default: 'pending_sender' }),
    __metadata("design:type", String)
], Sep31TransactionEntity.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'idempotency_key', type: 'varchar', nullable: true, unique: true }),
    __metadata("design:type", String)
], Sep31TransactionEntity.prototype, "idempotencyKey", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'quote_id', type: 'varchar', nullable: true }),
    __metadata("design:type", String)
], Sep31TransactionEntity.prototype, "quoteId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'stellar_tx_hash', type: 'varchar', nullable: true }),
    __metadata("design:type", String)
], Sep31TransactionEntity.prototype, "stellarTxHash", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'stellar_account', type: 'varchar', nullable: true }),
    __metadata("design:type", String)
], Sep31TransactionEntity.prototype, "stellarAccount", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'stellar_memo', type: 'varchar', nullable: true }),
    __metadata("design:type", String)
], Sep31TransactionEntity.prototype, "stellarMemo", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'stellar_memo_type', type: 'varchar', nullable: true }),
    __metadata("design:type", String)
], Sep31TransactionEntity.prototype, "stellarMemoType", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'napas_ref_id', type: 'varchar', nullable: true }),
    __metadata("design:type", String)
], Sep31TransactionEntity.prototype, "napasRefId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'vnd_amount', type: 'decimal', precision: 15, scale: 0, nullable: true }),
    __metadata("design:type", Number)
], Sep31TransactionEntity.prototype, "vndAmount", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'withheld_tax_amount', type: 'decimal', precision: 15, scale: 0, nullable: true }),
    __metadata("design:type", Number)
], Sep31TransactionEntity.prototype, "withheldTaxAmount", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'tax_code', type: 'varchar', nullable: true }),
    __metadata("design:type", String)
], Sep31TransactionEntity.prototype, "taxCode", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'retry_count', type: 'int', default: 0 }),
    __metadata("design:type", Number)
], Sep31TransactionEntity.prototype, "retryCount", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'error_message', type: 'text', nullable: true }),
    __metadata("design:type", String)
], Sep31TransactionEntity.prototype, "errorMessage", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'expires_at', type: 'timestamp', nullable: true }),
    __metadata("design:type", Date)
], Sep31TransactionEntity.prototype, "expiresAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'distribution_id', type: 'varchar', nullable: true }),
    __metadata("design:type", String)
], Sep31TransactionEntity.prototype, "distributionId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'exchange_rate', type: 'decimal', precision: 12, scale: 4, nullable: true }),
    __metadata("design:type", Number)
], Sep31TransactionEntity.prototype, "exchangeRate", void 0);
exports.Sep31TransactionEntity = Sep31TransactionEntity = __decorate([
    (0, typeorm_1.Entity)({ name: 'sep31_transactions' }),
    (0, typeorm_1.Index)(['idempotencyKey'], { unique: true }),
    (0, typeorm_1.Index)(['stellarTxHash'])
], Sep31TransactionEntity);
//# sourceMappingURL=sep31-transaction.entity.js.map