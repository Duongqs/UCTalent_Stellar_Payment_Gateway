export declare class BankVaultController {
    inquiry(body: {
        bankCode?: string;
        accountNumber?: string;
    }): Promise<{
        accountName: string;
    }>;
    register(body: {
        userId?: string;
        kycId?: string;
        bankCode?: string;
        accountNumber?: string;
        accountName?: string;
    }): Promise<{
        beneficiaryRefId: string;
    }>;
}
