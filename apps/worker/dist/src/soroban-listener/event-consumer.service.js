"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventConsumerService = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const core_1 = require("@uc/core");
const axios_1 = __importDefault(require("axios"));
const crypto = __importStar(require("crypto"));
let EventConsumerService = class EventConsumerService {
    eventQueueRepo;
    envService;
    isProcessing = false;
    constructor(eventQueueRepo, envService) {
        this.eventQueueRepo = eventQueueRepo;
        this.envService = envService;
    }
    async processQueue() {
        if (this.isProcessing)
            return;
        this.isProcessing = true;
        let row;
        try {
            row = await this.eventQueueRepo.findOne({
                where: { status: 'pending' },
                order: { id: 'ASC' },
            });
            if (!row) {
                this.isProcessing = false;
                return;
            }
            console.log(`[Event Consumer] Processing queued event #${row.id} (Tx: ${row.txHash})`);
            const payload = row.payloadJson;
            const payloadString = JSON.stringify(payload);
            const localApiPort = this.envService.get('PORT') || 8081;
            const localDisburseUrl = `http://localhost:${localApiPort}/api/anchor/disburse`;
            const localSecret = this.envService.get('WEBHOOK_SECRET') || 'uctalent-dev-secret';
            const localSignature = 'sha256=' + crypto
                .createHmac('sha256', localSecret)
                .update(payloadString)
                .digest('hex');
            try {
                const localRes = await axios_1.default.post(localDisburseUrl, payload, {
                    headers: {
                        'Content-Type': 'application/json',
                        'X-UCTALENT-SIGNATURE': localSignature,
                    },
                    timeout: 10000,
                });
                console.log(`[Event Consumer] Local disburse response: ${localRes.status}`);
            }
            catch (err) {
                console.error(`[Event Consumer] Local disburse failed: ${err.message}`);
                throw err;
            }
            const backendWebhookUrl = this.envService.get('UCTALENT_BACKEND_WEBHOOK_URL');
            let targetBackendUrl = backendWebhookUrl;
            if (targetBackendUrl) {
                if (targetBackendUrl.includes('settlement-callback')) {
                    targetBackendUrl = targetBackendUrl.replace('settlement-callback', 'webhook');
                }
                if (!targetBackendUrl.includes('/v2/')) {
                    targetBackendUrl = targetBackendUrl.replace('/api/', '/api/v2/');
                }
            }
            else {
                targetBackendUrl = 'http://localhost:4000/api/v2/cross-border/webhook';
            }
            const backendSecret = this.envService.get('CROSS_BORDER_WEBHOOK_SECRET') || 'uctalent-dev-secret';
            const backendSig = crypto
                .createHmac('sha256', backendSecret)
                .update(payloadString)
                .digest('hex');
            const backendSignature = `sha256=${backendSig}`;
            try {
                const backendRes = await axios_1.default.post(targetBackendUrl, payload, {
                    headers: {
                        'Content-Type': 'application/json',
                        'X-UCTALENT-SIGNATURE': backendSignature,
                    },
                    timeout: 10000,
                });
                console.log(`[Event Consumer] Backend webhook response: ${backendRes.status}`);
            }
            catch (err) {
                console.error(`[Event Consumer] Backend webhook failed: ${err.message}`);
                throw err;
            }
            await this.eventQueueRepo.update(row.id, {
                status: 'completed',
            });
        }
        catch (err) {
            const status = err.response?.status || 'N/A';
            console.error(`[Event Consumer] Webhook dispatch failed (HTTP ${status}):`, err.message);
            if (row) {
                await this.eventQueueRepo.update(row.id, {
                    status: 'failed',
                    errorMessage: err.message,
                    retryCount: (row.retryCount || 0) + 1,
                });
            }
        }
        finally {
            this.isProcessing = false;
        }
    }
};
exports.EventConsumerService = EventConsumerService;
__decorate([
    (0, schedule_1.Interval)(2000),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], EventConsumerService.prototype, "processQueue", null);
exports.EventConsumerService = EventConsumerService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(core_1.BridgeEventQueueEntity)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        core_1.EnvService])
], EventConsumerService);
//# sourceMappingURL=event-consumer.service.js.map