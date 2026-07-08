import { Repository } from 'typeorm';
import { BankProfileEntity, EncryptionService } from '@uc/core';
import { NinePayGatewayService } from './ninepay-gateway.service';
import { NameMatchingService } from './name-matching.service';
export declare class BankVaultService {
    private readonly bankProfileRepo;
    private readonly encryption;
    private readonly ninePayGatewayService;
    private readonly nameMatchingService;
    constructor(bankProfileRepo: Repository<BankProfileEntity>, encryption: EncryptionService, ninePayGatewayService: NinePayGatewayService, nameMatchingService: NameMatchingService);
    registerProfile(data: {
        customer_id: string;
        stellar_wallet: string;
        account_number: string;
        legal_name: string;
        bank_code: string;
    }): Promise<BankProfileEntity>;
    getProfile(customerId: string): Promise<BankProfileEntity | null>;
    hydrateBankInfo(refId: string): Promise<{
        account_number: string;
        legal_name: string;
        bank_code: string;
        stellar_wallet: string;
        is_verified: boolean;
    }>;
}
