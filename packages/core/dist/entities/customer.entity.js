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
exports.CustomerEntity = void 0;
const typeorm_1 = require("typeorm");
const base_entity_1 = require("./base.entity");
let CustomerEntity = class CustomerEntity extends base_entity_1.BaseEntity {
};
exports.CustomerEntity = CustomerEntity;
__decorate([
    (0, typeorm_1.Column)({ name: 'stellar_account', type: 'varchar', nullable: true }),
    __metadata("design:type", String)
], CustomerEntity.prototype, "stellarAccount", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'first_name', type: 'varchar', nullable: true }),
    __metadata("design:type", String)
], CustomerEntity.prototype, "firstName", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'last_name', type: 'varchar', nullable: true }),
    __metadata("design:type", String)
], CustomerEntity.prototype, "lastName", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'email_address', type: 'varchar', nullable: true }),
    __metadata("design:type", String)
], CustomerEntity.prototype, "emailAddress", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', default: 'PROCESSING' }),
    __metadata("design:type", String)
], CustomerEntity.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'customer_type', type: 'varchar', default: 'sep31-receiver' }),
    __metadata("design:type", String)
], CustomerEntity.prototype, "customerType", void 0);
exports.CustomerEntity = CustomerEntity = __decorate([
    (0, typeorm_1.Entity)({ name: 'customers' }),
    (0, typeorm_1.Index)(['stellarAccount'])
], CustomerEntity);
//# sourceMappingURL=customer.entity.js.map