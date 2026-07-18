import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DatabaseModule } from './database/database.module';
import { EnvModule } from './config/env.module';
import { Sep31TransactionEntity } from './entities/sep31-transaction.entity';
import { FirmQuoteEntity } from './entities/firm-quote.entity';
import { BridgeEventQueueEntity } from './entities/bridge-event-queue.entity';
import { DisbursementAuditLogEntity } from './entities/disbursement-audit-log.entity';
import { CustomerEntity } from './entities/customer.entity';
import { BankProfileEntity } from './entities/bank-profile.entity';
import { SyncStateEntity } from './entities/sync-state.entity';
import { EncryptionService } from './services/encryption.service';
import { Sep9ValidationService } from './services/sep9-validation.service';
import { AuditLogService } from './services/audit-log.service';
import { CustomerService } from './services/customer.service';
import { FirmQuoteService } from './services/firm-quote.service';
import { Sep31CoreService } from './services/sep31-core.service';
import { SqlMigrationService } from './services/sql-migration.service';

@Global()
@Module({
  imports: [
    DatabaseModule,
    EnvModule,
    TypeOrmModule.forFeature([
      Sep31TransactionEntity,
      FirmQuoteEntity,
      BridgeEventQueueEntity,
      DisbursementAuditLogEntity,
      CustomerEntity,
      BankProfileEntity,
      SyncStateEntity,
    ]),
  ],
  providers: [
    EncryptionService,
    Sep9ValidationService,
    AuditLogService,
    CustomerService,
    FirmQuoteService,
    Sep31CoreService,
    SqlMigrationService,
  ],
  exports: [
    DatabaseModule,
    EnvModule,
    TypeOrmModule,
    EncryptionService,
    Sep9ValidationService,
    AuditLogService,
    CustomerService,
    FirmQuoteService,
    Sep31CoreService,
    SqlMigrationService,
  ],
})
export class CoreModule {}
