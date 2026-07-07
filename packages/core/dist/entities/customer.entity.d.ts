import { BaseEntity } from './base.entity';
export type KYCStatus = 'ACCEPTED' | 'NEEDS_INFO' | 'PROCESSING' | 'REJECTED';
export declare class CustomerEntity extends BaseEntity {
    stellarAccount: string;
    firstName: string;
    lastName: string;
    emailAddress: string;
    idNumberEnc: string;
    idType: string;
    status: KYCStatus;
    customerType: string;
}
