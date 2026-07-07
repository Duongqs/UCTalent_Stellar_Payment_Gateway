import { Sep9ValidationService } from '@uc/core';
export declare class KycController {
    private readonly sep9Validation;
    constructor(sep9Validation: Sep9ValidationService);
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
