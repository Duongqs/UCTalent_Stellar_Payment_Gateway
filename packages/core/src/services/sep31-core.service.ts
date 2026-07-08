import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Sep31TransactionEntity } from '../entities/sep31-transaction.entity';
import { DisbursementAuditLogEntity } from '../entities/disbursement-audit-log.entity';

@Injectable()
export class Sep31CoreService {
  constructor(
    @InjectRepository(Sep31TransactionEntity)
    private readonly sep31Repo: Repository<Sep31TransactionEntity>,
    private readonly dataSource: DataSource
  ) {}

  async findById(id: string): Promise<Sep31TransactionEntity | null> {
    return this.sep31Repo.findOne({ where: { id } });
  }

  async findByIdempotencyKey(key: string): Promise<Sep31TransactionEntity | null> {
    return this.sep31Repo.findOne({ where: { idempotencyKey: key } });
  }

  async findByStellarTxHash(stellarTxHash: string): Promise<Sep31TransactionEntity[]> {
    return this.sep31Repo.find({ where: { stellarTxHash } });
  }

  create(data: Partial<Sep31TransactionEntity>): Sep31TransactionEntity {
    return this.sep31Repo.create(data);
  }

  async insert(tx: Sep31TransactionEntity): Promise<void> {
    await this.sep31Repo.insert(tx);
  }

  async save(tx: Sep31TransactionEntity): Promise<Sep31TransactionEntity> {
    return this.sep31Repo.save(tx);
  }

  async update(id: string, updateData: Partial<Sep31TransactionEntity>): Promise<void> {
    await this.sep31Repo.update(id, updateData);
  }

  async updateWithQueryBuilder(id: string, updateData: Partial<Sep31TransactionEntity>): Promise<void> {
    await this.sep31Repo.createQueryBuilder()
      .update(Sep31TransactionEntity)
      .set(updateData)
      .where('id = :id', { id })
      .execute();
  }

  async delete(id: string): Promise<void> {
    await this.sep31Repo.delete(id);
  }

  async hasEventLogged(transactionId: string, eventType: string): Promise<boolean> {
    const audit = this.dataSource.getRepository(DisbursementAuditLogEntity);
    const existing = await audit.findOne({
      where: {
        transactionId,
        eventType,
      },
    });
    return !!existing;
  }

  async completeDisbursement(transactionId: string, externalTransactionId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const sep31 = manager.getRepository(Sep31TransactionEntity);
      const audit = manager.getRepository(DisbursementAuditLogEntity);

      await sep31.update(transactionId, {
        status: 'completed',
      });
      const logEntry = audit.create({
        transactionId,
        eventType: 'ipn_success',
        payload: { external_transaction_id: externalTransactionId },
      });
      await audit.save(logEntry);
    });
  }

  async retryDisbursement(transactionId: string, retryCount: number, nextRetryMs: number): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const sep31 = manager.getRepository(Sep31TransactionEntity);
      const audit = manager.getRepository(DisbursementAuditLogEntity);

      await sep31.update(transactionId, {
        retryCount: retryCount + 1,
      });
      const logEntry = audit.create({
        transactionId,
        eventType: 'ipn_failed_retry',
        payload: {
          attempt: retryCount + 1,
          next_retry_ms: nextRetryMs,
        },
      });
      await audit.save(logEntry);
    });
  }

  async failDisbursement(transactionId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const sep31 = manager.getRepository(Sep31TransactionEntity);
      const audit = manager.getRepository(DisbursementAuditLogEntity);

      await sep31.update(transactionId, {
        status: 'error',
        errorMessage: 'Max retries exceeded',
      });
      const logEntry = audit.create({
        transactionId,
        eventType: 'ipn_failed_final',
        payload: { reason: 'max_retries' },
      });
      await audit.save(logEntry);
    });
  }
}
