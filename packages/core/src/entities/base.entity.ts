import { v4 as uuidv4 } from 'uuid';
import { BeforeInsert, Column, PrimaryGeneratedColumn } from 'typeorm';

export abstract class BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    name: 'created_at',
    transformer: {
      to: (value: Date) => value || new Date(),
      from: (value: Date) => value,
    },
  })
  createdAt: Date;

  @Column({
    name: 'updated_at',
    transformer: {
      to: (value: Date) => value || new Date(),
      from: (value: Date) => value,
    },
  })
  updatedAt: Date;

  @BeforeInsert()
  setDefaults(): void {
    if (!this.id) {
      this.id = uuidv4();
    }
    if (!this.createdAt) {
      this.createdAt = new Date();
    }
    if (!this.updatedAt) {
      this.updatedAt = new Date();
    }
  }
}
