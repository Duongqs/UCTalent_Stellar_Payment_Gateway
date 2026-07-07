import { Column, Entity } from 'typeorm';
import { BaseEntity } from './base.entity';

@Entity({ name: 'firm_quotes' })
export class FirmQuoteEntity extends BaseEntity {
  @Column({ name: 'sell_asset', type: 'varchar' })
  sellAsset: string;

  @Column({ name: 'buy_asset', type: 'varchar' })
  buyAsset: string;

  @Column({ name: 'sell_amount', type: 'varchar' })
  sellAmount: string;

  @Column({ name: 'buy_amount', type: 'varchar' })
  buyAmount: string;

  @Column({ type: 'varchar' })
  rate: string;

  @Column({ type: 'varchar' })
  context: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'used_at', type: 'timestamptz', nullable: true })
  usedAt: Date;

  @Column({ name: 'transaction_id', type: 'varchar', nullable: true })
  transactionId: string;
}
