import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from './base.entity';

export type KYCStatus = 'ACCEPTED' | 'NEEDS_INFO' | 'PROCESSING' | 'REJECTED';

@Entity({ name: 'customers' })
@Index(['stellarAccount'])
export class CustomerEntity extends BaseEntity {
  @Column({ name: 'stellar_account', type: 'varchar', nullable: true })
  stellarAccount: string;

  @Column({ name: 'first_name', type: 'varchar', nullable: true })
  firstName: string;

  @Column({ name: 'last_name', type: 'varchar', nullable: true })
  lastName: string;

  @Column({ name: 'email_address', type: 'varchar', nullable: true })
  emailAddress: string;

  @Column({ type: 'varchar', default: 'PROCESSING' })
  status: KYCStatus;

  @Column({ name: 'customer_type', type: 'varchar', default: 'sep31-receiver' })
  customerType: string;
}
