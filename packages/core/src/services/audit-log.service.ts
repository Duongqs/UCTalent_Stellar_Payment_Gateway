import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DisbursementAuditLogEntity } from '../entities/disbursement-audit-log.entity';

const SENSITIVE_KEYS = [
  'account_number', 'id_number', 'legal_name',
  'encrypted_account', 'encrypted_name', 'id_number_enc',
];

function sanitizeForLog(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  const clean = { ...obj };
  for (const key of SENSITIVE_KEYS) {
    if (key in clean) clean[key] = '[REDACTED]';
  }
  return clean;
}

@Injectable()
export class AuditLogService {
  constructor(
    @InjectRepository(DisbursementAuditLogEntity)
    private readonly auditLogRepo: Repository<DisbursementAuditLogEntity>
  ) {}

  async log(transactionId: string, eventType: string, payload: Record<string, any>): Promise<void> {
    const safePayload = sanitizeForLog(payload);
    const logEntry = this.auditLogRepo.create({
      transactionId,
      eventType,
      payload: safePayload,
    });
    await this.auditLogRepo.save(logEntry);
  }
}
