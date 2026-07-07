import { BankProfileModel, BankProfileRecord } from '../models/bank-profile.model';
import { NinePayGatewayService } from './ninepay-gateway.service';
import { decrypt } from './encryption.service';
import { NameMatchingService } from './name-matching.service';

export class BankVaultService {
  /**
   * Registers a new bank profile with real 9Pay NAPAS inquiry validation.
   */
  static async registerProfile(data: {
    customer_id: string;
    stellar_wallet: string;
    account_number: string;
    legal_name: string;
    bank_code: string;
  }): Promise<BankProfileRecord> {
    // Create profile (encrypts account_number and legal_name before storage)
    const record = await BankProfileModel.create(data);

    // Validate via real 9Pay NAPAS inquiry
    const accountName = await NinePayGatewayService.lookupAccount(
      data.account_number,
      data.bank_code
    );

    if (!accountName) {
      throw new Error('Bank account verification failed: NAPAS lookup returned no name');
    }

    // Name matching is handled early at registration time to prevent late failure during disbursement
    NameMatchingService.reconcileNames(data.legal_name, accountName, `registration-${data.customer_id}`);

    await BankProfileModel.markVerified(record.id);
    record.is_verified = true;

    return record;
  }

  /**
   * Get bank profile for a customer (PostgreSQL lookup).
   */
  static async getProfile(customerId: string): Promise<BankProfileRecord | null> {
    return BankProfileModel.findByCustomerId(customerId);
  }

  /**
   * Hydrate bank info for disbursement — decrypts sensitive fields.
   * Returned data should only exist in memory during request processing.
   */
  static async hydrateBankInfo(refId: string): Promise<{
    account_number: string;
    legal_name: string;
    bank_code: string;
    stellar_wallet: string;
    is_verified: boolean;
  }> {
    const record = await BankProfileModel.findByRefId(refId);
    if (!record) throw new Error(`Bank profile not found for ref: ${refId}`);

    return {
      account_number: decrypt(record.encrypted_account),
      legal_name: decrypt(record.encrypted_name),
      bank_code: record.bank_code,
      stellar_wallet: record.stellar_wallet,
      is_verified: record.is_verified,
    };
  }
}
