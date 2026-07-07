export declare class KycController {
    getCustomer(id?: string, account?: string, type?: string): Promise<{
        status: string;
        fields: Record<string, any>;
        id?: string | undefined;
        provided_fields?: undefined;
    } | {
        id: string;
        status: import("@uc/core").KYCStatus;
        provided_fields: Record<string, any> | undefined;
    }>;
    putCustomer(body: Record<string, any>): Promise<{
        id: string;
    }>;
}
