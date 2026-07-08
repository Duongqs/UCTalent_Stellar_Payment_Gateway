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
exports.BankVaultService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const core_1 = require("@uc/core");
const ninepay_gateway_service_1 = require("./ninepay-gateway.service");
const name_matching_service_1 = require("./name-matching.service");
let BankVaultService = class BankVaultService {
    constructor(bankProfileRepo, encryption, ninePayGatewayService, nameMatchingService) {
        this.bankProfileRepo = bankProfileRepo;
        this.encryption = encryption;
        this.ninePayGatewayService = ninePayGatewayService;
        this.nameMatchingService = nameMatchingService;
    }
    async registerProfile(data) {
        const beneficiaryRefId = this.encryption.createBeneficiaryRefId(data.stellar_wallet, data.account_number);
        let profile = await this.bankProfileRepo.findOne({ where: { beneficiaryRefId } });
        if (!profile) {
            profile = new core_1.BankProfileEntity();
            profile.beneficiaryRefId = beneficiaryRefId;
        }
        profile.customerId = data.customer_id;
        profile.stellarWallet = data.stellar_wallet;
        profile.encryptedAccount = this.encryption.encrypt(data.account_number);
        profile.encryptedName = this.encryption.encrypt(data.legal_name);
        profile.bankCode = data.bank_code;
        profile.isVerified = false;
        profile.verifiedAt = null;
        const saved = await this.bankProfileRepo.save(profile);
        const accountName = await this.ninePayGatewayService.lookupAccount(data.account_number, data.bank_code);
        if (!accountName) {
            throw new Error('Bank account verification failed: NAPAS lookup returned no name');
        }
        this.nameMatchingService.reconcileNames(data.legal_name, accountName, `registration-${data.customer_id}`);
        saved.isVerified = true;
        saved.verifiedAt = new Date();
        await this.bankProfileRepo.save(saved);
        return saved;
    }
    async getProfile(customerId) {
        return this.bankProfileRepo.findOne({ where: { customerId } });
    }
    async hydrateBankInfo(refId) {
        const record = await this.bankProfileRepo.findOne({ where: { beneficiaryRefId: refId } });
        if (!record)
            throw new Error(`Bank profile not found for ref: ${refId}`);
        return {
            account_number: this.encryption.decrypt(record.encryptedAccount),
            legal_name: this.encryption.decrypt(record.encryptedName),
            bank_code: record.bankCode,
            stellar_wallet: record.stellarWallet,
            is_verified: record.isVerified,
        };
    }
};
exports.BankVaultService = BankVaultService;
exports.BankVaultService = BankVaultService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(core_1.BankProfileEntity)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        core_1.EncryptionService,
        ninepay_gateway_service_1.NinePayGatewayService,
        name_matching_service_1.NameMatchingService])
], BankVaultService);
//# sourceMappingURL=bank-vault.service.js.map