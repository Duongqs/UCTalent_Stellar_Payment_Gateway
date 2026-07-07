import { Injectable } from '@nestjs/common';
import { BankProfileModel, BankProfileRecord, decrypt } from '@uc/core';
import { NinePayGatewayService } from './ninepay-gateway.service';
import { NameMatchingService } from './name-matching.service';

@Injectable()
export class BankVaultService {
  constructor(
    private readonly ninePayGatewayService: NinePayGatewayService,
    private readonly nameMatchingService: NameMatchingService
  ) {}

  async registerProfile(data: {
    customer_id: string;
    stellar_wallet: string;
    account_number: string;
    legal_name: string;
    bank_code: string;
  }): Promise<BankProfileRecord> {
    const record = await BankProfileModel.create(data);

    const accountName = await this.ninePayGatewayService.lookupAccount(
      data.account_number,
      data.bank_code
    );

    if (!accountName) {
      throw new Error('Bank account verification failed: NAPAS lookup returned no name');
    }

    this.nameMatchingService.reconcileNames(data.legal_name, accountName, `registration-${data.customer_id}`);

    await BankProfileModel.markVerified(record.id);
    record.is_verified = true;

    return record;
  }

  async getProfile(customerId: string): Promise<BankProfileRecord | null> {
    return BankProfileModel.findByCustomerId(customerId);
  }

  async hydrateBankInfo(refId: string): Promise<{
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
