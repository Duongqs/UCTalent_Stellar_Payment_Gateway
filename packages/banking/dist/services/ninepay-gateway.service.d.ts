import { NameMatchingService } from './name-matching.service';
export declare class NinePayGatewayService {
    private readonly nameMatchingService;
    private merchantKey;
    private secretKey;
    private apiUrl;
    constructor(nameMatchingService: NameMatchingService);
    private buildHttpQuery;
    private createSignature;
    private buildAuthHeader;
    private request;
    lookupAccount(accountNumber: string, bankCode: string): Promise<string | null>;
    disburse(amount: number, invoiceNo: string, bankCode: string, accountNumber: string, description: string, kycName: string, complianceMeta?: Record<string, string>): Promise<any>;
}
