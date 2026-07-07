export declare class NinePayGatewayService {
    private static merchantKey;
    private static secretKey;
    private static apiUrl;
    private static buildHttpQuery;
    private static createSignature;
    private static buildAuthHeader;
    private static request;
    static lookupAccount(accountNumber: string, bankCode: string): Promise<string | null>;
    static disburse(amount: number, invoiceNo: string, bankCode: string, accountNumber: string, description: string, kycName: string, complianceMeta?: Record<string, string>): Promise<any>;
}
