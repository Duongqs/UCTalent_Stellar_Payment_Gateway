import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DatabaseModule } from './database/database.module';
import { Sep31TransactionEntity } from './entities/sep31-transaction.entity';
import { FirmQuoteEntity } from './entities/firm-quote.entity';
import { BridgeEventQueueEntity } from './entities/bridge-event-queue.entity';
import { DisbursementAuditLogEntity } from './entities/disbursement-audit-log.entity';
import { CustomerEntity } from './entities/customer.entity';
import { BankProfileEntity } from './entities/bank-profile.entity';
import { EncryptionService } from './services/encryption.service';
import { Sep9ValidationService } from './services/sep9-validation.service';

@Module({
  imports: [
    DatabaseModule,
    TypeOrmModule.forFeature([
      Sep31TransactionEntity,
      FirmQuoteEntity,
      BridgeEventQueueEntity,
      DisbursementAuditLogEntity,
      CustomerEntity,
      BankProfileEntity,
    ]),
  ],
  providers: [EncryptionService, Sep9ValidationService],
  exports: [
    DatabaseModule,
    TypeOrmModule,
    EncryptionService,
    Sep9ValidationService,
  ],
})
export class CoreModule {}
