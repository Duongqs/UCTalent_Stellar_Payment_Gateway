import { NameMatchingService } from './name-matching.service';
import { EnvService } from '@uc/core';
export declare class NinePayGatewayService {
    private readonly envService;
    private readonly nameMatchingService;
    constructor(envService: EnvService, nameMatchingService: NameMatchingService);
    private get merchantKey();
    private get secretKey();
    private get apiUrl();
    private buildHttpQuery;
    private createSignature;
    private buildAuthHeader;
    private request;
    lookupAccount(accountNumber: string, bankCode: string): Promise<string | null>;
    disburse(amount: number, invoiceNo: string, bankCode: string, accountNumber: string, description: string, kycName: string, complianceMeta?: Record<string, string>): Promise<any>;
}
