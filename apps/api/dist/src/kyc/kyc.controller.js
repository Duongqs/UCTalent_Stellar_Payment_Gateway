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
exports.computeKycStatus = computeKycStatus;
const common_1 = require("@nestjs/common");
const core_1 = require("@uc/core");
const put_customer_dto_1 = require("./dtos/put-customer.dto");
const get_customer_dto_1 = require("./dtos/get-customer.dto");
function computeKycStatus(type, fields) {
    const { first_name, last_name, email_address, id_number } = fields;
    if (type === 'sep31-sender' && first_name && last_name && email_address) {
        return 'ACCEPTED';
    }
    if (type === 'sep31-receiver' &&
        first_name &&
        last_name &&
        email_address &&
        id_number) {
        return 'ACCEPTED';
    }
    if (first_name && last_name) {
        return 'PROCESSING';
    }
    return 'NEEDS_INFO';
}
let KycController = class KycController {
    customerService;
    encryption;
    sep9Validation;
    auditLog;
    constructor(customerService, encryption, sep9Validation, auditLog) {
        this.customerService = customerService;
        this.encryption = encryption;
        this.sep9Validation = sep9Validation;
        this.auditLog = auditLog;
    }
    async getCustomer(query) {
        const { id, account, type } = query;
        if (!id && !account && !type) {
            throw new common_1.BadRequestException('Must provide id, account, or type');
        }
        try {
            let customer = null;
            if (id) {
                const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
                if (isUuid) {
                    customer = await this.customerService.findById(id);
                }
            }
            else if (account) {
                customer = await this.customerService.findByAccount(account);
            }
            if (!customer) {
                const fields = {
                    first_name: {
                        description: 'First name',
                        type: 'string',
                        optional: false,
                    },
                    last_name: {
                        description: 'Last name',
                        type: 'string',
                        optional: false,
                    },
                    email_address: {
                        description: 'Email address',
                        type: 'string',
                        optional: false,
                    },
                };
                if (type === 'sep31-receiver') {
                    fields.id_number = {
                        description: 'National ID (CCCD)',
                        type: 'string',
                        optional: false,
                    };
                    fields.id_country = {
                        description: 'ID issuing country (ISO 3166-1 alpha-3)',
                        type: 'string',
                        optional: false,
                    };
                }
                return {
                    ...(id || account ? { id: id || account } : {}),
                    status: 'NEEDS_INFO',
                    fields,
                };
            }
            const provided_fields = {};
            if (customer.firstName)
                provided_fields.first_name = {
                    description: 'First name',
                    type: 'string',
                    status: 'ACCEPTED',
                };
            if (customer.lastName)
                provided_fields.last_name = {
                    description: 'Last name',
                    type: 'string',
                    status: 'ACCEPTED',
                };
            if (customer.emailAddress)
                provided_fields.email_address = {
                    description: 'Email address',
                    type: 'string',
                    status: 'ACCEPTED',
                };
            if (customer.idNumberEnc)
                provided_fields.id_number = {
                    description: 'National ID Number',
                    type: 'string',
                    status: 'ACCEPTED',
                };
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
                details: validation.errors,
            });
        }
        try {
            let idToUpdate = body.id;
            if (!idToUpdate && body.account) {
                const existing = await this.customerService.findByAccount(body.account);
                if (existing)
                    idToUpdate = existing.id;
            }
            const status = computeKycStatus(body.type, body);
            const encIdNumber = body.id_number
                ? this.encryption.encrypt(body.id_number)
                : undefined;
            let customer;
            if (idToUpdate) {
                customer =
                    (await this.customerService.findById(idToUpdate)) ||
                        this.customerService.create({});
                if (!customer.id) {
                    customer.id = idToUpdate;
                }
            }
            else {
                customer = this.customerService.create({});
            }
            if (body.account)
                customer.stellarAccount = body.account;
            if (body.first_name)
                customer.firstName = body.first_name;
            if (body.last_name)
                customer.lastName = body.last_name;
            if (body.email_address)
                customer.emailAddress = body.email_address;
            if (encIdNumber)
                customer.idNumberEnc = encIdNumber;
            if (body.id_type)
                customer.idType = body.id_type;
            customer.customerType = body.type;
            customer.status = status;
            const saved = await this.customerService.save(customer);
            await this.auditLog.log(saved.id, 'kyc_updated', {
                type: body.type,
                status: saved.status,
            });
            return { id: saved.id };
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
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [get_customer_dto_1.GetCustomerDto]),
    __metadata("design:returntype", Promise)
], KycController.prototype, "getCustomer", null);
__decorate([
    (0, common_1.Put)(),
    (0, common_1.HttpCode)(common_1.HttpStatus.ACCEPTED),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [put_customer_dto_1.PutCustomerDto]),
    __metadata("design:returntype", Promise)
], KycController.prototype, "putCustomer", null);
exports.KycController = KycController = __decorate([
    (0, common_1.Controller)('customer'),
    __metadata("design:paramtypes", [core_1.CustomerService,
        core_1.EncryptionService,
        core_1.Sep9ValidationService,
        core_1.AuditLogService])
], KycController);
//# sourceMappingURL=kyc.controller.js.map