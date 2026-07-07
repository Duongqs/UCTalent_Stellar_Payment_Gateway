import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from './base.entity';

@Entity({ name: 'bank_profiles' })
@Index(['customerId'])
@Index(['beneficiaryRefId'], { unique: true })
export class BankProfileEntity extends BaseEntity {
  @Column({ name: 'customer_id', type: 'varchar' })
  customerId: string;

  @Column({ name: 'stellar_wallet', type: 'varchar' })
  stellarWallet: string;

  @Column({ name: 'encrypted_account', type: 'text' })
  encryptedAccount: string;

  @Column({ name: 'encrypted_name', type: 'text' })
  encryptedName: string;

  @Column({ name: 'bank_code', type: 'varchar' })
  bankCode: string;

  @Column({ name: 'beneficiary_ref_id', type: 'varchar', unique: true })
  beneficiaryRefId: string;

  @Column({ name: 'is_verified', type: 'boolean', default: false })
  isVerified: boolean;

  @Column({ name: 'verified_at', type: 'timestamptz', nullable: true })
  verifiedAt: Date;
}
