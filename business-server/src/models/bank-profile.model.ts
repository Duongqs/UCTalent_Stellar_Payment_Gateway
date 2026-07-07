import { v4 as uuidv4 } from 'uuid';
import { encrypt, decrypt, createBeneficiaryRefId } from '../services/encryption.service';
import { query } from '../db';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BankProfileRecord {
  id: string;
  customer_id: string;
  stellar_wallet: string;
  encrypted_account: string;
  encrypted_name: string;
  bank_code: string;
  beneficiary_ref_id: string;
  is_verified: boolean;
  verified_at?: Date;
  created_at: Date;
}

// ─── Model (PostgreSQL-backed) ────────────────────────────────────────────────

export class BankProfileModel {
  static async create(data: {
    customer_id: string;
    stellar_wallet: string;
    account_number: string;
    legal_name: string;
    bank_code: string;
  }): Promise<BankProfileRecord> {
    const id = uuidv4();
    const beneficiaryRefId = createBeneficiaryRefId(data.stellar_wallet, data.account_number);

    const result = await query<BankProfileRecord>(
      `INSERT INTO bank_profiles (id, customer_id, stellar_wallet, encrypted_account, encrypted_name, bank_code, beneficiary_ref_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (beneficiary_ref_id) 
       DO UPDATE SET 
         customer_id = EXCLUDED.customer_id,
         encrypted_name = EXCLUDED.encrypted_name,
         bank_code = EXCLUDED.bank_code,
         is_verified = false
       RETURNING *`,
      [
        id,
        data.customer_id,
        data.stellar_wallet,
        encrypt(data.account_number),
        encrypt(data.legal_name),
        data.bank_code,
        beneficiaryRefId,
      ]
    );

    if (!result) throw new Error('Failed to create bank profile');
    return result;
  }

  static async findByRefId(refId: string): Promise<BankProfileRecord | null> {
    return query<BankProfileRecord>(
      'SELECT * FROM bank_profiles WHERE beneficiary_ref_id = $1',
      [refId]
    );
  }

  static async findByCustomerId(customerId: string): Promise<BankProfileRecord | null> {
    return query<BankProfileRecord>(
      'SELECT * FROM bank_profiles WHERE customer_id = $1',
      [customerId]
    );
  }

  static async markVerified(id: string): Promise<void> {
    await query(
      'UPDATE bank_profiles SET is_verified = true, verified_at = now() WHERE id = $1',
      [id]
    );
  }

  // Decrypt sensitive fields for processing (data stays in memory only during request)
  static decryptAccount(encrypted: string): string {
    return decrypt(encrypted);
  }

  static decryptName(encrypted: string): string {
    return decrypt(encrypted);
  }
}
