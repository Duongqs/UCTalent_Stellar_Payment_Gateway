export declare class EncryptionService {
    encrypt(plaintext: string): string;
    decrypt(token: string): string;
    createBeneficiaryRefId(stellarWallet: string, accountNumber: string): string;
}
export declare function encrypt(plaintext: string): string;
export declare function decrypt(token: string): string;
export declare function createBeneficiaryRefId(stellarWallet: string, accountNumber: string): string;
