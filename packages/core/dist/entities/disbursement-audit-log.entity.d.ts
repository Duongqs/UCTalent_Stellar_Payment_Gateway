import { BaseEntity } from './base.entity';
export declare class DisbursementAuditLogEntity extends BaseEntity {
    transactionId: string;
    eventType: string;
    payload: Record<string, any>;
}
