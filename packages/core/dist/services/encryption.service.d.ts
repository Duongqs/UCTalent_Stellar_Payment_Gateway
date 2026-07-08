import { EnvService } from '../config/env.service';
export declare class EncryptionService {
    private readonly envService;
    constructor(envService: EnvService);
    private getSecret;
    private deriveKey;
    encrypt(plaintext: string): string;
    decrypt(token: string): string;
    createBeneficiaryRefId(stellarWallet: string, accountNumber: string): string;
}
