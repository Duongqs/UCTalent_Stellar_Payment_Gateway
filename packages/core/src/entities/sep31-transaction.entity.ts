import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from './base.entity';

@Entity({ name: 'sep31_transactions' })
@Index(['idempotencyKey'], { unique: true })
@Index(['stellarTxHash'])
export class Sep31TransactionEntity extends BaseEntity {
  @Column({ name: 'amount_in', type: 'decimal', precision: 18, scale: 7, nullable: true })
  amountIn: string;

  @Column({ name: 'asset_code', type: 'varchar', default: 'USDC' })
  assetCode: string;

  @Column({ name: 'sender_id', type: 'varchar', nullable: true })
  senderId: string;

  @Column({ name: 'receiver_id', type: 'varchar', nullable: true })
  receiverId: string;

  @Column({ type: 'varchar', default: 'pending_sender' })
  status: string;

  @Column({ name: 'idempotency_key', type: 'varchar', nullable: true, unique: true })
  idempotencyKey: string;

  @Column({ name: 'quote_id', type: 'varchar', nullable: true })
  quoteId: string;

  @Column({ name: 'stellar_tx_hash', type: 'varchar', nullable: true })
  stellarTxHash: string;

  @Column({ name: 'stellar_account', type: 'varchar', nullable: true })
  stellarAccount: string;

  @Column({ name: 'stellar_memo', type: 'varchar', nullable: true })
  stellarMemo: string;

  @Column({ name: 'stellar_memo_type', type: 'varchar', nullable: true })
  stellarMemoType: string;

  @Column({ name: 'napas_ref_id', type: 'varchar', nullable: true })
  napasRefId: string;

  @Column({ name: 'vnd_amount', type: 'decimal', precision: 15, scale: 0, nullable: true })
  vndAmount: number;

  @Column({ name: 'withheld_tax_amount', type: 'decimal', precision: 15, scale: 0, nullable: true })
  withheldTaxAmount: number;

  @Column({ name: 'tax_code', type: 'varchar', nullable: true })
  taxCode: string;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string;
}
