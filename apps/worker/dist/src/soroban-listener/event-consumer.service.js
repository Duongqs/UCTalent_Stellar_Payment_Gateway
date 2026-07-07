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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventConsumerService = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const core_1 = require("@uc/core");
const axios_1 = __importDefault(require("axios"));
const crypto = __importStar(require("crypto"));
let EventConsumerService = class EventConsumerService {
    isProcessing = false;
    async processQueue() {
        if (this.isProcessing)
            return;
        this.isProcessing = true;
        try {
            const row = await (0, core_1.query)(`SELECT id, ledger, tx_hash, payload_json FROM bridge_events_queue 
         WHERE status = 'pending' 
         ORDER BY id ASC LIMIT 1`);
            if (!row) {
                this.isProcessing = false;
                return;
            }
            console.log(`[Event Consumer] Processing queued event #${row.id} (Tx: ${row.tx_hash})`);
            const webhookUrl = process.env.SEP31_WEBHOOK_URL || 'http://localhost:3000/api/webhooks/sdp';
            const webhookSecret = process.env.CROSS_BORDER_WEBHOOK_SECRET || 'uctalent-dev-secret';
            const payload = JSON.parse(row.payload_json);
            const payloadString = JSON.stringify(payload);
            const signature = 'sha256=' + crypto.createHmac('sha256', webhookSecret).update(payloadString).digest('hex');
            try {
                const res = await axios_1.default.post(webhookUrl, payload, {
                    headers: {
                        'Content-Type': 'application/json',
                        'X-UCTALENT-SIGNATURE': signature
                    },
                    timeout: 10000,
                });
                console.log(`[Event Consumer] Webhook response ${res.status}:`, JSON.stringify(res.data).substring(0, 150));
                await (0, core_1.query)("UPDATE bridge_events_queue SET status = 'completed', updated_at = now() WHERE id = $1", [row.id]);
            }
            catch (err) {
                const status = err.response?.status || 'N/A';
                console.error(`[Event Consumer] Webhook dispatch failed (HTTP ${status}):`, err.message);
                await (0, core_1.query)(`UPDATE bridge_events_queue 
           SET status = 'failed', error_message = $2, retry_count = retry_count + 1, updated_at = now() 
           WHERE id = $1`, [row.id, err.message]);
            }
        }
        catch (err) {
            console.error('[Event Consumer] Queue processing error:', err.message);
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
    (0, common_1.Injectable)()
], EventConsumerService);
//# sourceMappingURL=event-consumer.service.js.map