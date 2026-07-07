import { BankVaultService, NinePayGatewayService } from '@uc/banking';
export declare class BankVaultController {
    private readonly bankVaultService;
    private readonly ninePayGateway;
    constructor(bankVaultService: BankVaultService, ninePayGateway: NinePayGatewayService);
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
