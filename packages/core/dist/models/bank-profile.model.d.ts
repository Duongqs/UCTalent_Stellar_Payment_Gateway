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
export declare class BankProfileModel {
    static create(data: {
        customer_id: string;
        stellar_wallet: string;
        account_number: string;
        legal_name: string;
        bank_code: string;
    }): Promise<BankProfileRecord>;
    static findByRefId(refId: string): Promise<BankProfileRecord | null>;
    static findByCustomerId(customerId: string): Promise<BankProfileRecord | null>;
    static markVerified(id: string): Promise<void>;
    static decryptAccount(encrypted: string): string;
    static decryptName(encrypted: string): string;
}
