import { BaseEntity } from './base.entity';
export declare class Sep31TransactionEntity extends BaseEntity {
    amountIn: string;
    assetCode: string;
    senderId: string;
    receiverId: string;
    status: string;
    idempotencyKey: string;
    quoteId: string;
    stellarTxHash: string;
    stellarAccount: string;
    stellarMemo: string;
    stellarMemoType: string;
    napasRefId: string;
    vndAmount: number;
    withheldTaxAmount: number;
    taxCode: string;
    errorMessage: string;
}
