"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CoreModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const database_module_1 = require("./database/database.module");
const env_module_1 = require("./config/env.module");
const sep31_transaction_entity_1 = require("./entities/sep31-transaction.entity");
const firm_quote_entity_1 = require("./entities/firm-quote.entity");
const bridge_event_queue_entity_1 = require("./entities/bridge-event-queue.entity");
const disbursement_audit_log_entity_1 = require("./entities/disbursement-audit-log.entity");
const customer_entity_1 = require("./entities/customer.entity");
const bank_profile_entity_1 = require("./entities/bank-profile.entity");
const sync_state_entity_1 = require("./entities/sync-state.entity");
const encryption_service_1 = require("./services/encryption.service");
const sep9_validation_service_1 = require("./services/sep9-validation.service");
const audit_log_service_1 = require("./services/audit-log.service");
const customer_service_1 = require("./services/customer.service");
const firm_quote_service_1 = require("./services/firm-quote.service");
const sep31_core_service_1 = require("./services/sep31-core.service");
const sql_migration_service_1 = require("./services/sql-migration.service");
let CoreModule = class CoreModule {
};
exports.CoreModule = CoreModule;
exports.CoreModule = CoreModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        imports: [
            database_module_1.DatabaseModule,
            env_module_1.EnvModule,
            typeorm_1.TypeOrmModule.forFeature([
                sep31_transaction_entity_1.Sep31TransactionEntity,
                firm_quote_entity_1.FirmQuoteEntity,
                bridge_event_queue_entity_1.BridgeEventQueueEntity,
                disbursement_audit_log_entity_1.DisbursementAuditLogEntity,
                customer_entity_1.CustomerEntity,
                bank_profile_entity_1.BankProfileEntity,
                sync_state_entity_1.SyncStateEntity,
            ]),
        ],
        providers: [
            encryption_service_1.EncryptionService,
            sep9_validation_service_1.Sep9ValidationService,
            audit_log_service_1.AuditLogService,
            customer_service_1.CustomerService,
            firm_quote_service_1.FirmQuoteService,
            sep31_core_service_1.Sep31CoreService,
            sql_migration_service_1.SqlMigrationService,
        ],
        exports: [
            database_module_1.DatabaseModule,
            env_module_1.EnvModule,
            typeorm_1.TypeOrmModule,
            encryption_service_1.EncryptionService,
            sep9_validation_service_1.Sep9ValidationService,
            audit_log_service_1.AuditLogService,
            customer_service_1.CustomerService,
            firm_quote_service_1.FirmQuoteService,
            sep31_core_service_1.Sep31CoreService,
            sql_migration_service_1.SqlMigrationService,
        ],
    })
], CoreModule);
//# sourceMappingURL=core.module.js.map