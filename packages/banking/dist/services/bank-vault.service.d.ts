import { BankProfileRecord } from '@uc/core';
export declare class BankVaultService {
    static registerProfile(data: {
        customer_id: string;
        stellar_wallet: string;
        account_number: string;
        legal_name: string;
        bank_code: string;
    }): Promise<BankProfileRecord>;
    static getProfile(customerId: string): Promise<BankProfileRecord | null>;
    static hydrateBankInfo(refId: string): Promise<{
        account_number: string;
        legal_name: string;
        bank_code: string;
        stellar_wallet: string;
        is_verified: boolean;
    }>;
}
