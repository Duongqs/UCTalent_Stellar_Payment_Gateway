"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HealthController = void 0;
const common_1 = require("@nestjs/common");
const banking_1 = require("@uc/banking");
const core_1 = require("@uc/core");
let HealthController = class HealthController {
    oracleService;
    constructor(oracleService) {
        this.oracleService = oracleService;
    }
    async getHealth() {
        const dbHealth = await (0, core_1.checkHealth)();
        const circuitBreaker = this.oracleService.getCircuitBreakerState();
        const healthy = dbHealth.status === 'ok' && circuitBreaker !== 'OPEN';
        const response = {
            status: healthy ? 'healthy' : 'degraded',
            checks: {
                database: dbHealth,
                oracle_circuit_breaker: circuitBreaker,
            },
        };
        if (!healthy) {
            throw new common_1.ServiceUnavailableException(response);
        }
        return response;
    }
};
exports.HealthController = HealthController;
__decorate([
    (0, common_1.Get)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], HealthController.prototype, "getHealth", null);
exports.HealthController = HealthController = __decorate([
    (0, common_1.Controller)('health'),
    __metadata("design:paramtypes", [banking_1.OracleService])
], HealthController);
//# sourceMappingURL=health.controller.js.map