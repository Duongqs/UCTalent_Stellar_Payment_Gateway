import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from './base.entity';

@Entity({ name: 'bridge_events_queue' })
@Index(['txHash'], { unique: true })
@Index(['status'])
export class BridgeEventQueueEntity extends BaseEntity {
  @Column({ type: 'integer' })
  ledger: number;

  @Column({ name: 'tx_hash', type: 'varchar' })
  txHash: string;

  @Column({ name: 'contract_id', type: 'varchar' })
  contractId: string;

  @Column({ name: 'payload_json', type: 'simple-json' })
  payloadJson: Record<string, any>;

  @Column({ type: 'varchar', default: 'pending' })
  status: 'pending' | 'completed' | 'failed';

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string;

  @Column({ name: 'retry_count', type: 'integer', default: 0 })
  retryCount: number;
}
