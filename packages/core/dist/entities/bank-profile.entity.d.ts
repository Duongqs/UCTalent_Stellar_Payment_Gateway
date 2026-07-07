import { BaseEntity } from './base.entity';
export declare class BankProfileEntity extends BaseEntity {
    customerId: string;
    stellarWallet: string;
    encryptedAccount: string;
    encryptedName: string;
    bankCode: string;
    beneficiaryRefId: string;
    isVerified: boolean;
    verifiedAt: Date;
}
