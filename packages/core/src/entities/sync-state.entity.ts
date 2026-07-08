import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'sync_state' })
export class SyncStateEntity {
  @PrimaryColumn({ type: 'varchar' })
  key: string;

  @Column({ type: 'text' })
  value: string;
}
