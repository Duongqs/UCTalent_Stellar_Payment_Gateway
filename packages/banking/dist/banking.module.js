"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BankingModule = void 0;
const common_1 = require("@nestjs/common");
const stellar_1 = require("@uc/stellar");
const ninepay_gateway_service_1 = require("./services/ninepay-gateway.service");
const ninepay_mock_service_1 = require("./services/ninepay-mock.service");
const oracle_service_1 = require("./services/oracle.service");
const bank_vault_service_1 = require("./services/bank-vault.service");
const name_matching_service_1 = require("./services/name-matching.service");
let BankingModule = class BankingModule {
};
exports.BankingModule = BankingModule;
exports.BankingModule = BankingModule = __decorate([
    (0, common_1.Module)({
        imports: [stellar_1.StellarModule],
        providers: [
            ninepay_gateway_service_1.NinePayGatewayService,
            ninepay_mock_service_1.NinePayMockService,
            oracle_service_1.OracleService,
            bank_vault_service_1.BankVaultService,
            name_matching_service_1.NameMatchingService,
        ],
        exports: [
            ninepay_gateway_service_1.NinePayGatewayService,
            ninepay_mock_service_1.NinePayMockService,
            oracle_service_1.OracleService,
            bank_vault_service_1.BankVaultService,
            name_matching_service_1.NameMatchingService,
        ],
    })
], BankingModule);
//# sourceMappingURL=banking.module.js.map