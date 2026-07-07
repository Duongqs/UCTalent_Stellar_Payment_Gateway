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
exports.FirmQuoteEntity = void 0;
const typeorm_1 = require("typeorm");
const base_entity_1 = require("./base.entity");
let FirmQuoteEntity = class FirmQuoteEntity extends base_entity_1.BaseEntity {
};
exports.FirmQuoteEntity = FirmQuoteEntity;
__decorate([
    (0, typeorm_1.Column)({ name: 'sell_asset', type: 'varchar' }),
    __metadata("design:type", String)
], FirmQuoteEntity.prototype, "sellAsset", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'buy_asset', type: 'varchar' }),
    __metadata("design:type", String)
], FirmQuoteEntity.prototype, "buyAsset", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'sell_amount', type: 'varchar' }),
    __metadata("design:type", String)
], FirmQuoteEntity.prototype, "sellAmount", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'buy_amount', type: 'varchar' }),
    __metadata("design:type", String)
], FirmQuoteEntity.prototype, "buyAmount", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar' }),
    __metadata("design:type", String)
], FirmQuoteEntity.prototype, "rate", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar' }),
    __metadata("design:type", String)
], FirmQuoteEntity.prototype, "context", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'expires_at', type: 'timestamptz' }),
    __metadata("design:type", Date)
], FirmQuoteEntity.prototype, "expiresAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'used_at', type: 'timestamptz', nullable: true }),
    __metadata("design:type", Date)
], FirmQuoteEntity.prototype, "usedAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'transaction_id', type: 'varchar', nullable: true }),
    __metadata("design:type", String)
], FirmQuoteEntity.prototype, "transactionId", void 0);
exports.FirmQuoteEntity = FirmQuoteEntity = __decorate([
    (0, typeorm_1.Entity)({ name: 'firm_quotes' })
], FirmQuoteEntity);
//# sourceMappingURL=firm-quote.entity.js.map