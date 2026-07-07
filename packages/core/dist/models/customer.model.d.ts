export type KYCStatus = 'ACCEPTED' | 'NEEDS_INFO' | 'PROCESSING' | 'REJECTED';
export interface CustomerRecord {
    id: string;
    stellar_account?: string;
    first_name?: string;
    last_name?: string;
    email_address?: string;
    id_number_enc?: string;
    id_type?: string;
    status: KYCStatus;
    customer_type: string;
    created_at: Date;
    updated_at: Date;
}
export declare function computeKycStatus(type: string, fields: {
    first_name?: string;
    last_name?: string;
    email_address?: string;
    id_number?: string;
}): KYCStatus;
export declare class CustomerModel {
    static createOrUpdate(data: {
        id?: string;
        stellar_account?: string;
        first_name?: string;
        last_name?: string;
        email_address?: string;
        id_number?: string;
        id_country?: string;
        id_type?: string;
        type: string;
    }): Promise<CustomerRecord>;
    static findById(id: string): Promise<CustomerRecord | null>;
    static findByAccount(account: string): Promise<CustomerRecord | null>;
}
