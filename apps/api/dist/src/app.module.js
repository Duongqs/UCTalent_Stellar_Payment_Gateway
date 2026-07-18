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
const core_1 = require("@uc/core");
const stellar_1 = require("@uc/stellar");
const banking_1 = require("@uc/banking");
const kyc_module_1 = require("./kyc/kyc.module");
const rate_module_1 = require("./rate/rate.module");
const bank_vault_module_1 = require("./bank-vault/bank-vault.module");
const sep31_module_1 = require("./sep31/sep31.module");
const ipn_module_1 = require("./ipn/ipn.module");
const health_module_1 = require("./health/health.module");
const auth_module_1 = require("./auth/auth.module");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            core_1.CoreModule,
            stellar_1.StellarModule,
            banking_1.BankingModule,
            kyc_module_1.KycModule,
            rate_module_1.RateModule,
            bank_vault_module_1.BankVaultModule,
            sep31_module_1.Sep31Module,
            ipn_module_1.IpnModule,
            health_module_1.HealthModule,
            auth_module_1.AuthModule,
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map