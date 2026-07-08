import { BankVaultService, NinePayGatewayService } from '@uc/banking';
import { CustomerService } from '@uc/core';
import { BankVaultInquiryDto } from './dtos/bank-vault-inquiry.dto';
import { BankVaultRegisterDto } from './dtos/bank-vault-register.dto';
export declare class BankVaultController {
    private readonly customerService;
    private readonly bankVaultService;
    private readonly ninePayGateway;
    constructor(customerService: CustomerService, bankVaultService: BankVaultService, ninePayGateway: NinePayGatewayService);
    inquiry(body: BankVaultInquiryDto): Promise<{
        accountName: string;
    }>;
    register(body: BankVaultRegisterDto): Promise<{
        beneficiaryRefId: string;
    }>;
}
