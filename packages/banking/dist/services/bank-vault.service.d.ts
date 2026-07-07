import { BankProfileRecord } from '@uc/core';
import { NinePayGatewayService } from './ninepay-gateway.service';
import { NameMatchingService } from './name-matching.service';
export declare class BankVaultService {
    private readonly ninePayGatewayService;
    private readonly nameMatchingService;
    constructor(ninePayGatewayService: NinePayGatewayService, nameMatchingService: NameMatchingService);
    registerProfile(data: {
        customer_id: string;
        stellar_wallet: string;
        account_number: string;
        legal_name: string;
        bank_code: string;
    }): Promise<BankProfileRecord>;
    getProfile(customerId: string): Promise<BankProfileRecord | null>;
    hydrateBankInfo(refId: string): Promise<{
        account_number: string;
        legal_name: string;
        bank_code: string;
        stellar_wallet: string;
        is_verified: boolean;
    }>;
}
