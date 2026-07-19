import { Sep9ValidationService, AuditLogService, CustomerService, KYCStatus } from '@uc/core';
import { PutCustomerDto } from './dtos/put-customer.dto';
import { GetCustomerDto } from './dtos/get-customer.dto';
export declare function computeKycStatus(type: string, fields: {
    first_name?: string;
    last_name?: string;
    email_address?: string;
}): KYCStatus;
export declare class KycController {
    private readonly customerService;
    private readonly sep9Validation;
    private readonly auditLog;
    constructor(customerService: CustomerService, sep9Validation: Sep9ValidationService, auditLog: AuditLogService);
    getCustomer(query: GetCustomerDto): Promise<{
        status: string;
        fields: Record<string, any>;
        id?: string | undefined;
        provided_fields?: undefined;
    } | {
        id: string;
        status: KYCStatus;
        provided_fields: Record<string, any> | undefined;
    }>;
    putCustomer(body: PutCustomerDto): Promise<{
        id: string;
    }>;
}
