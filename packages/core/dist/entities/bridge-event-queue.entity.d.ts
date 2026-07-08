import { BaseEntity } from './base.entity';
export declare class BridgeEventQueueEntity extends BaseEntity {
    ledger: number;
    txHash: string;
    contractId: string;
    payloadJson: Record<string, any>;
    status: 'pending' | 'completed' | 'failed';
    errorMessage: string;
    retryCount: number;
}
