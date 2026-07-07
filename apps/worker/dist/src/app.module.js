"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const core_1 = require("@uc/core");
const stellar_1 = require("@uc/stellar");
const banking_1 = require("@uc/banking");
const soroban_listener_service_1 = require("./soroban-listener/soroban-listener.service");
const event_consumer_service_1 = require("./soroban-listener/event-consumer.service");
const disbursement_poller_service_1 = require("./disbursement/disbursement-poller.service");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            schedule_1.ScheduleModule.forRoot(),
            core_1.CoreModule,
            stellar_1.StellarModule,
            banking_1.BankingModule,
        ],
        providers: [
            soroban_listener_service_1.SorobanListenerService,
            event_consumer_service_1.EventConsumerService,
            disbursement_poller_service_1.DisbursementPollerService,
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map