import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from './base.entity';

@Entity({ name: 'disbursement_audit_log' })
@Index(['transactionId'])
export class DisbursementAuditLogEntity extends BaseEntity {
  @Column({ name: 'transaction_id', type: 'varchar' })
  transactionId: string;

  @Column({ name: 'event_type', type: 'varchar' })
  eventType: string;

  @Column({ type: 'simple-json' })
  payload: Record<string, any>;
}
