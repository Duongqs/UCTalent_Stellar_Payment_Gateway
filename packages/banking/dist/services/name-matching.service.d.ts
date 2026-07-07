export declare class NameMatchingService {
    isMatch(kycName: string, bankAccountName: string): boolean;
    reconcileNames(kycName: string, bankAccountName: string, transactionId: string): void;
}
