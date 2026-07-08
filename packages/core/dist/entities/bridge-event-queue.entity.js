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
exports.BridgeEventQueueEntity = void 0;
const typeorm_1 = require("typeorm");
const base_entity_1 = require("./base.entity");
let BridgeEventQueueEntity = class BridgeEventQueueEntity extends base_entity_1.BaseEntity {
};
exports.BridgeEventQueueEntity = BridgeEventQueueEntity;
__decorate([
    (0, typeorm_1.Column)({ type: 'integer' }),
    __metadata("design:type", Number)
], BridgeEventQueueEntity.prototype, "ledger", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'tx_hash', type: 'varchar' }),
    __metadata("design:type", String)
], BridgeEventQueueEntity.prototype, "txHash", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'contract_id', type: 'varchar' }),
    __metadata("design:type", String)
], BridgeEventQueueEntity.prototype, "contractId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'payload_json', type: 'simple-json' }),
    __metadata("design:type", Object)
], BridgeEventQueueEntity.prototype, "payloadJson", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', default: 'pending' }),
    __metadata("design:type", String)
], BridgeEventQueueEntity.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'error_message', type: 'text', nullable: true }),
    __metadata("design:type", String)
], BridgeEventQueueEntity.prototype, "errorMessage", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'retry_count', type: 'integer', default: 0 }),
    __metadata("design:type", Number)
], BridgeEventQueueEntity.prototype, "retryCount", void 0);
exports.BridgeEventQueueEntity = BridgeEventQueueEntity = __decorate([
    (0, typeorm_1.Entity)({ name: 'bridge_events_queue' }),
    (0, typeorm_1.Index)(['txHash'], { unique: true }),
    (0, typeorm_1.Index)(['status'])
], BridgeEventQueueEntity);
//# sourceMappingURL=bridge-event-queue.entity.js.map