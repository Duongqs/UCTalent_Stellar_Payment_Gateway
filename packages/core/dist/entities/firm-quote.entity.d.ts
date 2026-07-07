import { BaseEntity } from './base.entity';
export declare class FirmQuoteEntity extends BaseEntity {
    sellAsset: string;
    buyAsset: string;
    sellAmount: string;
    buyAmount: string;
    rate: string;
    context: string;
    expiresAt: Date;
    usedAt: Date;
    transactionId: string;
}
