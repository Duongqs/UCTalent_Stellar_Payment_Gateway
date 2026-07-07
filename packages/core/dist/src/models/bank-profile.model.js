"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BankProfileModel = void 0;
const uuid_1 = require("uuid");
const encryption_service_1 = require("../services/encryption.service");
const db_1 = require("../db");
class BankProfileModel {
    static async create(data) {
        const id = (0, uuid_1.v4)();
        const beneficiaryRefId = (0, encryption_service_1.createBeneficiaryRefId)(data.stellar_wallet, data.account_number);
        const result = await (0, db_1.query)(`INSERT INTO bank_profiles (id, customer_id, stellar_wallet, encrypted_account, encrypted_name, bank_code, beneficiary_ref_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (beneficiary_ref_id) 
       DO UPDATE SET 
         customer_id = EXCLUDED.customer_id,
         encrypted_name = EXCLUDED.encrypted_name,
         bank_code = EXCLUDED.bank_code,
         is_verified = false
       RETURNING *`, [
            id,
            data.customer_id,
            data.stellar_wallet,
            (0, encryption_service_1.encrypt)(data.account_number),
            (0, encryption_service_1.encrypt)(data.legal_name),
            data.bank_code,
            beneficiaryRefId,
        ]);
        if (!result)
            throw new Error('Failed to create bank profile');
        return result;
    }
    static async findByRefId(refId) {
        return (0, db_1.query)('SELECT * FROM bank_profiles WHERE beneficiary_ref_id = $1', [refId]);
    }
    static async findByCustomerId(customerId) {
        return (0, db_1.query)('SELECT * FROM bank_profiles WHERE customer_id = $1', [customerId]);
    }
    static async markVerified(id) {
        await (0, db_1.query)('UPDATE bank_profiles SET is_verified = true, verified_at = now() WHERE id = $1', [id]);
    }
    static decryptAccount(encrypted) {
        return (0, encryption_service_1.decrypt)(encrypted);
    }
    static decryptName(encrypted) {
        return (0, encryption_service_1.decrypt)(encrypted);
    }
}
exports.BankProfileModel = BankProfileModel;
//# sourceMappingURL=bank-profile.model.js.map