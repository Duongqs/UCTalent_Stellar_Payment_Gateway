import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BankProfileEntity, EncryptionService } from '@uc/core';
import { NinePayGatewayService } from './ninepay-gateway.service';
import { NameMatchingService } from './name-matching.service';

@Injectable()
export class BankVaultService {
  constructor(
    @InjectRepository(BankProfileEntity)
    private readonly bankProfileRepo: Repository<BankProfileEntity>,
    private readonly encryption: EncryptionService,
    private readonly ninePayGatewayService: NinePayGatewayService,
    private readonly nameMatchingService: NameMatchingService
  ) {}

  async registerProfile(data: {
    customer_id: string;
    stellar_wallet: string;
    account_number: string;
    legal_name: string;
    bank_code: string;
  }): Promise<BankProfileEntity> {
    const beneficiaryRefId = this.encryption.createBeneficiaryRefId(data.stellar_wallet, data.account_number);

    let profile = await this.bankProfileRepo.findOne({ where: { beneficiaryRefId } });
    if (!profile) {
      profile = new BankProfileEntity();
      profile.beneficiaryRefId = beneficiaryRefId;
    }

    profile.customerId = data.customer_id;
    profile.stellarWallet = data.stellar_wallet;
    profile.encryptedAccount = this.encryption.encrypt(data.account_number);
    profile.encryptedName = this.encryption.encrypt(data.legal_name);
    profile.bankCode = data.bank_code;
    profile.isVerified = false;
    profile.verifiedAt = null as any;

    const saved = await this.bankProfileRepo.save(profile);

    const accountName = await this.ninePayGatewayService.lookupAccount(
      data.account_number,
      data.bank_code
    );

    if (!accountName) {
      throw new Error('Bank account verification failed: NAPAS lookup returned no name');
    }

    this.nameMatchingService.reconcileNames(data.legal_name, accountName, `registration-${data.customer_id}`);

    saved.isVerified = true;
    saved.verifiedAt = new Date();
    await this.bankProfileRepo.save(saved);

    return saved;
  }

  async getProfile(customerId: string): Promise<BankProfileEntity | null> {
    return this.bankProfileRepo.findOne({ where: { customerId } });
  }

  async hydrateBankInfo(refId: string): Promise<{
    account_number: string;
    legal_name: string;
    bank_code: string;
    stellar_wallet: string;
    is_verified: boolean;
  }> {
    const record = await this.bankProfileRepo.findOne({ where: { beneficiaryRefId: refId } });
    if (!record) throw new Error(`Bank profile not found for ref: ${refId}`);

    return {
      account_number: this.encryption.decrypt(record.encryptedAccount),
      legal_name: this.encryption.decrypt(record.encryptedName),
      bank_code: record.bankCode,
      stellar_wallet: record.stellarWallet,
      is_verified: record.isVerified,
    };
  }
}
