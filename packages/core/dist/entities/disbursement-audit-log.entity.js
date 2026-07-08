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
exports.DisbursementAuditLogEntity = void 0;
const typeorm_1 = require("typeorm");
const base_entity_1 = require("./base.entity");
let DisbursementAuditLogEntity = class DisbursementAuditLogEntity extends base_entity_1.BaseEntity {
};
exports.DisbursementAuditLogEntity = DisbursementAuditLogEntity;
__decorate([
    (0, typeorm_1.Column)({ name: 'transaction_id', type: 'varchar' }),
    __metadata("design:type", String)
], DisbursementAuditLogEntity.prototype, "transactionId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'event_type', type: 'varchar' }),
    __metadata("design:type", String)
], DisbursementAuditLogEntity.prototype, "eventType", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'simple-json' }),
    __metadata("design:type", Object)
], DisbursementAuditLogEntity.prototype, "payload", void 0);
exports.DisbursementAuditLogEntity = DisbursementAuditLogEntity = __decorate([
    (0, typeorm_1.Entity)({ name: 'disbursement_audit_log' }),
    (0, typeorm_1.Index)(['transactionId'])
], DisbursementAuditLogEntity);
//# sourceMappingURL=disbursement-audit-log.entity.js.map