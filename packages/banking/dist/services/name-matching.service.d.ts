export declare class NameMatchingService {
    static isMatch(kycName: string, bankAccountName: string): boolean;
    static reconcileNames(kycName: string, bankAccountName: string, transactionId: string): void;
}
