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
exports.BankVaultService = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@uc/core");
const ninepay_gateway_service_1 = require("./ninepay-gateway.service");
const name_matching_service_1 = require("./name-matching.service");
let BankVaultService = class BankVaultService {
    constructor(ninePayGatewayService, nameMatchingService) {
        this.ninePayGatewayService = ninePayGatewayService;
        this.nameMatchingService = nameMatchingService;
    }
    async registerProfile(data) {
        const record = await core_1.BankProfileModel.create(data);
        const accountName = await this.ninePayGatewayService.lookupAccount(data.account_number, data.bank_code);
        if (!accountName) {
            throw new Error('Bank account verification failed: NAPAS lookup returned no name');
        }
        this.nameMatchingService.reconcileNames(data.legal_name, accountName, `registration-${data.customer_id}`);
        await core_1.BankProfileModel.markVerified(record.id);
        record.is_verified = true;
        return record;
    }
    async getProfile(customerId) {
        return core_1.BankProfileModel.findByCustomerId(customerId);
    }
    async hydrateBankInfo(refId) {
        const record = await core_1.BankProfileModel.findByRefId(refId);
        if (!record)
            throw new Error(`Bank profile not found for ref: ${refId}`);
        return {
            account_number: (0, core_1.decrypt)(record.encrypted_account),
            legal_name: (0, core_1.decrypt)(record.encrypted_name),
            bank_code: record.bank_code,
            stellar_wallet: record.stellar_wallet,
            is_verified: record.is_verified,
        };
    }
};
exports.BankVaultService = BankVaultService;
exports.BankVaultService = BankVaultService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [ninepay_gateway_service_1.NinePayGatewayService,
        name_matching_service_1.NameMatchingService])
], BankVaultService);
//# sourceMappingURL=bank-vault.service.js.map