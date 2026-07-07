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
exports.BankVaultController = void 0;
const common_1 = require("@nestjs/common");
const banking_1 = require("@uc/banking");
const core_1 = require("@uc/core");
const crypto_1 = require("crypto");
let BankVaultController = class BankVaultController {
    bankVaultService;
    ninePayGateway;
    constructor(bankVaultService, ninePayGateway) {
        this.bankVaultService = bankVaultService;
        this.ninePayGateway = ninePayGateway;
    }
    async inquiry(body) {
        const { bankCode, accountNumber } = body;
        if (!bankCode || !accountNumber) {
            throw new common_1.BadRequestException('Missing bankCode or accountNumber');
        }
        try {
            const accountName = await this.ninePayGateway.lookupAccount(accountNumber, bankCode);
            if (!accountName) {
                throw new common_1.NotFoundException('Account not found or invalid');
            }
            return { accountName };
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException)
                throw error;
            throw new common_1.InternalServerErrorException(error.message);
        }
    }
    async register(body) {
        const { userId, kycId, bankCode, accountNumber, accountName } = body;
        if (!userId || !bankCode || !accountNumber || !accountName) {
            throw new common_1.BadRequestException('Missing required fields');
        }
        try {
            const customerId = kycId || (0, crypto_1.randomUUID)();
            await core_1.CustomerModel.createOrUpdate({
                id: customerId,
                type: 'sep31-receiver',
                first_name: accountName,
            });
            const record = await this.bankVaultService.registerProfile({
                customer_id: customerId,
                stellar_wallet: '',
                account_number: accountNumber,
                legal_name: accountName,
                bank_code: bankCode,
            });
            return { beneficiaryRefId: record.beneficiary_ref_id };
        }
        catch (error) {
            throw new common_1.BadRequestException(error.message);
        }
    }
};
exports.BankVaultController = BankVaultController;
__decorate([
    (0, common_1.Post)('inquiry'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], BankVaultController.prototype, "inquiry", null);
__decorate([
    (0, common_1.Post)('register'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], BankVaultController.prototype, "register", null);
exports.BankVaultController = BankVaultController = __decorate([
    (0, common_1.Controller)('api/v1/bank-vault'),
    __metadata("design:paramtypes", [banking_1.BankVaultService,
        banking_1.NinePayGatewayService])
], BankVaultController);
//# sourceMappingURL=bank-vault.controller.js.map