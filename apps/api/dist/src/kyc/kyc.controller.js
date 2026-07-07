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
exports.KycController = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@uc/core");
let KycController = class KycController {
    sep9Validation;
    constructor(sep9Validation) {
        this.sep9Validation = sep9Validation;
    }
    async getCustomer(id, account, type) {
        if (!id && !account && !type) {
            throw new common_1.BadRequestException('Must provide id, account, or type');
        }
        try {
            let customer;
            if (id) {
                const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
                if (isUuid) {
                    customer = await core_1.CustomerModel.findById(id);
                }
            }
            else if (account) {
                customer = await core_1.CustomerModel.findByAccount(account);
            }
            if (!customer) {
                const fields = {
                    first_name: { description: 'First name', type: 'string', optional: false },
                    last_name: { description: 'Last name', type: 'string', optional: false },
                    email_address: { description: 'Email address', type: 'string', optional: false },
                };
                if (type === 'sep31-receiver') {
                    fields.id_number = { description: 'National ID (CCCD)', type: 'string', optional: false };
                    fields.id_country = { description: 'ID issuing country (ISO 3166-1 alpha-3)', type: 'string', optional: false };
                }
                return {
                    ...(id || account ? { id: id || account } : {}),
                    status: 'NEEDS_INFO',
                    fields,
                };
            }
            const provided_fields = {};
            if (customer.first_name)
                provided_fields.first_name = { description: 'First name', type: 'string', status: 'ACCEPTED' };
            if (customer.last_name)
                provided_fields.last_name = { description: 'Last name', type: 'string', status: 'ACCEPTED' };
            if (customer.email_address)
                provided_fields.email_address = { description: 'Email address', type: 'string', status: 'ACCEPTED' };
            if (customer.id_number_enc)
                provided_fields.id_number = { description: 'National ID Number', type: 'string', status: 'ACCEPTED' };
            return {
                id: customer.id,
                status: customer.status,
                provided_fields: Object.keys(provided_fields).length > 0 ? provided_fields : undefined,
            };
        }
        catch (error) {
            console.error('[Customer] Error in getCustomer:', error);
            throw new common_1.InternalServerErrorException('Internal server error');
        }
    }
    async putCustomer(body) {
        const validation = this.sep9Validation.validate(body);
        if (!validation.isValid) {
            throw new common_1.BadRequestException({
                error: 'Invalid SEP-9 fields',
                details: validation.errors
            });
        }
        try {
            let idToUpdate = body.id;
            if (!idToUpdate && body.account) {
                const existing = await core_1.CustomerModel.findByAccount(body.account);
                if (existing)
                    idToUpdate = existing.id;
            }
            const customer = await core_1.CustomerModel.createOrUpdate({
                id: idToUpdate,
                stellar_account: body.account,
                first_name: body.first_name,
                last_name: body.last_name,
                email_address: body.email_address,
                id_number: body.id_number,
                id_country: body.id_country,
                id_type: body.id_type || 'national_id',
                type: body.type,
            });
            await (0, core_1.auditLog)(customer.id, 'kyc_updated', {
                type: body.type,
                status: customer.status,
            });
            return { id: customer.id };
        }
        catch (error) {
            console.error('[Customer] Error in putCustomer:', error);
            throw new common_1.InternalServerErrorException('Internal server error');
        }
    }
};
exports.KycController = KycController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Query)('id')),
    __param(1, (0, common_1.Query)('account')),
    __param(2, (0, common_1.Query)('type')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], KycController.prototype, "getCustomer", null);
__decorate([
    (0, common_1.Put)(),
    (0, common_1.HttpCode)(common_1.HttpStatus.ACCEPTED),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], KycController.prototype, "putCustomer", null);
exports.KycController = KycController = __decorate([
    (0, common_1.Controller)('customer'),
    __metadata("design:paramtypes", [core_1.Sep9ValidationService])
], KycController);
//# sourceMappingURL=kyc.controller.js.map