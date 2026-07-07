"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CustomerModel = void 0;
exports.computeKycStatus = computeKycStatus;
const uuid_1 = require("uuid");
const db_1 = require("../db");
const encryption_service_1 = require("../services/encryption.service");
function computeKycStatus(type, fields) {
    const { first_name, last_name, email_address, id_number } = fields;
    if (type === 'sep31-sender' && first_name && last_name && email_address) {
        return 'ACCEPTED';
    }
    if (type === 'sep31-receiver' && first_name && last_name && email_address && id_number) {
        return 'ACCEPTED';
    }
    if (first_name && last_name) {
        return 'PROCESSING';
    }
    return 'NEEDS_INFO';
}
class CustomerModel {
    static async createOrUpdate(data) {
        let id = data.id;
        if (!id && data.stellar_account) {
            const existing = await this.findByAccount(data.stellar_account);
            if (existing) {
                id = existing.id;
            }
        }
        id = id || (0, uuid_1.v4)();
        const status = computeKycStatus(data.type, data);
        const encIdNumber = data.id_number ? (0, encryption_service_1.encrypt)(data.id_number) : null;
        const result = await (0, db_1.query)(`INSERT INTO customers (id, stellar_account, first_name, last_name, email_address, id_number_enc, id_type, customer_type, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (id) DO UPDATE SET
         first_name = COALESCE(EXCLUDED.first_name, customers.first_name),
         last_name = COALESCE(EXCLUDED.last_name, customers.last_name),
         email_address = COALESCE(EXCLUDED.email_address, customers.email_address),
         id_number_enc = COALESCE(EXCLUDED.id_number_enc, customers.id_number_enc),
         id_type = COALESCE(EXCLUDED.id_type, customers.id_type),
         status = EXCLUDED.status,
         updated_at = now()
       RETURNING *`, [
            id,
            data.stellar_account || null,
            data.first_name || null,
            data.last_name || null,
            data.email_address || null,
            encIdNumber,
            data.id_type || 'national_id',
            data.type,
            status,
        ]);
        if (!result)
            throw new Error('Failed to create/update customer');
        return result;
    }
    static async findById(id) {
        return (0, db_1.query)('SELECT * FROM customers WHERE id = $1', [id]);
    }
    static async findByAccount(account) {
        return (0, db_1.query)('SELECT * FROM customers WHERE stellar_account = $1', [account]);
    }
}
exports.CustomerModel = CustomerModel;
//# sourceMappingURL=customer.model.js.map