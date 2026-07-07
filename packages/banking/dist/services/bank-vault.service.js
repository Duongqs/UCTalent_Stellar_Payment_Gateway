"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BankVaultService = void 0;
const core_1 = require("@uc/core");
const ninepay_gateway_service_1 = require("./ninepay-gateway.service");
const name_matching_service_1 = require("./name-matching.service");
class BankVaultService {
    static async registerProfile(data) {
        const record = await core_1.BankProfileModel.create(data);
        const accountName = await ninepay_gateway_service_1.NinePayGatewayService.lookupAccount(data.account_number, data.bank_code);
        if (!accountName) {
            throw new Error('Bank account verification failed: NAPAS lookup returned no name');
        }
        name_matching_service_1.NameMatchingService.reconcileNames(data.legal_name, accountName, `registration-${data.customer_id}`);
        await core_1.BankProfileModel.markVerified(record.id);
        record.is_verified = true;
        return record;
    }
    static async getProfile(customerId) {
        return core_1.BankProfileModel.findByCustomerId(customerId);
    }
    static async hydrateBankInfo(refId) {
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
}
exports.BankVaultService = BankVaultService;
//# sourceMappingURL=bank-vault.service.js.map