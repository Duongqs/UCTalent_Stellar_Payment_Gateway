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
const sep31_transaction_entity_1 = require("./entities/sep31-transaction.entity");
const firm_quote_entity_1 = require("./entities/firm-quote.entity");
const bridge_event_queue_entity_1 = require("./entities/bridge-event-queue.entity");
const disbursement_audit_log_entity_1 = require("./entities/disbursement-audit-log.entity");
const customer_entity_1 = require("./entities/customer.entity");
const bank_profile_entity_1 = require("./entities/bank-profile.entity");
const encryption_service_1 = require("./services/encryption.service");
const sep9_validation_service_1 = require("./services/sep9-validation.service");
let CoreModule = class CoreModule {
};
exports.CoreModule = CoreModule;
exports.CoreModule = CoreModule = __decorate([
    (0, common_1.Module)({
        imports: [
            database_module_1.DatabaseModule,
            typeorm_1.TypeOrmModule.forFeature([
                sep31_transaction_entity_1.Sep31TransactionEntity,
                firm_quote_entity_1.FirmQuoteEntity,
                bridge_event_queue_entity_1.BridgeEventQueueEntity,
                disbursement_audit_log_entity_1.DisbursementAuditLogEntity,
                customer_entity_1.CustomerEntity,
                bank_profile_entity_1.BankProfileEntity,
            ]),
        ],
        providers: [encryption_service_1.EncryptionService, sep9_validation_service_1.Sep9ValidationService],
        exports: [
            database_module_1.DatabaseModule,
            typeorm_1.TypeOrmModule,
            encryption_service_1.EncryptionService,
            sep9_validation_service_1.Sep9ValidationService,
        ],
    })
], CoreModule);
//# sourceMappingURL=core.module.js.map