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
exports.IpnController = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const stellar_1 = require("@uc/stellar");
const core_1 = require("@uc/core");
const banking_1 = require("@uc/banking");
const ipn_dto_1 = require("./dtos/ipn.dto");
const crypto = __importStar(require("crypto"));
const axios_1 = __importDefault(require("axios"));
let IpnController = class IpnController {
    sep31CoreService;
    anchorRpc;
    envService;
    ninePayGatewayService;
    requestCounts = new Map();
    constructor(sep31CoreService, anchorRpc, envService, ninePayGatewayService) {
        this.sep31CoreService = sep31CoreService;
        this.anchorRpc = anchorRpc;
        this.envService = envService;
        this.ninePayGatewayService = ninePayGatewayService;
    }
    async handleIpn(request, body) {
        const clientIp = request?.headers?.['x-forwarded-for'] || request?.socket?.remoteAddress || 'unknown';
        const now = Date.now();
        const requests = this.requestCounts.get(clientIp) || [];
        const recent = requests.filter(time => now - time < 60000);
        if (recent.length > 20) {
            throw new common_1.HttpException('Too Many Requests', common_1.HttpStatus.TOO_MANY_REQUESTS);
        }
        recent.push(now);
        this.requestCounts.set(clientIp, recent);
        const resultB64 = body.result;
        const receivedChecksum = body.checksum;
        const expectedChecksum = crypto
            .createHash('sha256')
            .update(resultB64 + (this.envService.get('NINEPAY_CHECKSUM_KEY') || ''))
            .digest('hex')
            .toUpperCase();
        if (receivedChecksum !== expectedChecksum) {
            console.error('[IPN] Invalid checksum');
            throw new common_1.UnauthorizedException('Invalid checksum');
        }
        try {
            const payloadStr = Buffer.from(resultB64, 'base64').toString('utf8');
            const payload = JSON.parse(payloadStr);
            const { invoice_no, transaction_id, external_transaction_id, status } = payload;
            console.log(`[IPN] Received: invoice=${invoice_no}, status=${status}`);
            const eventType = `ipn_${status.toLowerCase()}`;
            const existing = await this.sep31CoreService.hasEventLogged(transaction_id, eventType);
            if (existing) {
                console.log(`[IPN] Duplicate ${status} for ${transaction_id}, skipping`);
                return { message: 'Already processed' };
            }
            switch (status) {
                case 'SUCCESS':
                    if (!transaction_id.startsWith('ucttx')) {
                        await this.anchorRpc.notifyOffchainFundsAvailable(transaction_id, external_transaction_id);
                    }
                    await this.sep31CoreService.completeDisbursement(transaction_id, external_transaction_id);
                    const backendWebhookUrl = this.envService.get('UCTALENT_BACKEND_WEBHOOK_URL');
                    const isTest = this.envService.get('NODE_ENV') === 'test';
                    if (backendWebhookUrl && !isTest) {
                        const txRecord = await this.sep31CoreService.findById(transaction_id);
                        const distributionId = txRecord?.distributionId || txRecord?.idempotencyKey || transaction_id;
                        const callbackPayload = {
                            distributionId: distributionId,
                            anchorTxId: transaction_id,
                            invoiceNo: transaction_id,
                            status: 'success',
                            externalTxId: external_transaction_id,
                            vndAmount: txRecord?.vndAmount ? Number(txRecord.vndAmount) : undefined,
                            taxWithheld: txRecord?.withheldTaxAmount ? Number(txRecord.withheldTaxAmount) : undefined,
                            napasRefId: txRecord?.napasRefId || external_transaction_id,
                            stellarTxHash: txRecord?.stellarTxHash,
                            clearingId: transaction_id,
                        };
                        const callbackPayloadString = JSON.stringify(callbackPayload);
                        const secret = this.envService.get('CROSS_BORDER_WEBHOOK_SECRET') || 'uctalent-dev-secret';
                        const signature = crypto
                            .createHmac('sha256', secret)
                            .update(callbackPayloadString)
                            .digest('hex');
                        try {
                            await axios_1.default.post(backendWebhookUrl, callbackPayload, {
                                headers: {
                                    'Content-Type': 'application/json',
                                    'X-UCTALENT-SIGNATURE': `sha256=${signature}`,
                                },
                                timeout: 5000,
                            });
                        }
                        catch (err) {
                            console.error(`[IPN] Failed to send settlement callback to backend: ${err.message}`);
                        }
                    }
                    break;
                case 'FAILED': {
                    const tx = await this.sep31CoreService.findById(transaction_id);
                    const retryCount = tx?.retryCount ?? 0;
                    if (retryCount < 3) {
                        const nextRetryMs = Math.pow(2, retryCount) * 30_000;
                        await this.sep31CoreService.retryDisbursement(transaction_id, retryCount, nextRetryMs);
                        console.warn(`[IPN] FAILED for ${transaction_id}, retry ${retryCount + 1}/3 scheduled in ${nextRetryMs}ms`);
                    }
                    else {
                        if (!transaction_id.startsWith('ucttx')) {
                            await this.anchorRpc.notifyTransactionError(transaction_id, `Disbursement failed after 3 retries`);
                        }
                        await this.sep31CoreService.failDisbursement(transaction_id);
                        console.error(`[ALERT:disbursement_failed] TX ${transaction_id} failed after 3 retries`);
                        const backendWebhookUrl = this.envService.get('UCTALENT_BACKEND_WEBHOOK_URL');
                        const isTest = this.envService.get('NODE_ENV') === 'test';
                        if (backendWebhookUrl && !isTest) {
                            const txRecord = await this.sep31CoreService.findById(transaction_id);
                            const distributionId = txRecord?.distributionId || txRecord?.idempotencyKey || transaction_id;
                            const callbackPayload = {
                                distributionId: distributionId,
                                anchorTxId: transaction_id,
                                invoiceNo: transaction_id,
                                status: 'failed',
                            };
                            const callbackPayloadString = JSON.stringify(callbackPayload);
                            const secret = this.envService.get('CROSS_BORDER_WEBHOOK_SECRET') || 'uctalent-dev-secret';
                            const signature = crypto
                                .createHmac('sha256', secret)
                                .update(callbackPayloadString)
                                .digest('hex');
                            try {
                                await axios_1.default.post(backendWebhookUrl, callbackPayload, {
                                    headers: {
                                        'Content-Type': 'application/json',
                                        'X-UCTALENT-SIGNATURE': `sha256=${signature}`,
                                    },
                                    timeout: 5000,
                                });
                            }
                            catch (err) {
                                console.error(`[IPN] Failed to send failed settlement callback to backend: ${err.message}`);
                            }
                        }
                    }
                    break;
                }
                default:
                    console.warn(`[IPN] Unknown status '${status}' for ${transaction_id}`);
                    break;
            }
            return { message: 'Acknowledged' };
        }
        catch (error) {
            console.error('[IPN] Error handling webhook:', error);
            throw new common_1.InternalServerErrorException('Internal server error');
        }
    }
    async pollPendingExternal() {
        try {
            console.log('[IPN Cron] Polling 9Pay for pending_external transactions...');
            const pendingTransactions = await this.sep31CoreService.findPendingExternal();
            for (const tx of pendingTransactions) {
                console.log(`[IPN Cron] Checking status for transaction: ${tx.id} (invoice: ${tx.id})`);
                const result = await this.ninePayGatewayService.checkStatus(tx.id);
                if (result && result.status !== undefined) {
                    if (result.status === 5) {
                        console.log(`[IPN Cron] Transaction ${tx.id} is SUCCESS in 9Pay. Simulating IPN handling.`);
                        await this.handleIpn({ headers: {}, socket: {} }, {
                            result: Buffer.from(JSON.stringify({
                                invoice_no: tx.id,
                                transaction_id: tx.id,
                                external_transaction_id: result.transaction_id || `simulated-${Date.now()}`,
                                status: 'SUCCESS'
                            })).toString('base64'),
                            checksum: crypto
                                .createHash('sha256')
                                .update(Buffer.from(JSON.stringify({
                                invoice_no: tx.id,
                                transaction_id: tx.id,
                                external_transaction_id: result.transaction_id || `simulated-${Date.now()}`,
                                status: 'SUCCESS'
                            })).toString('base64') + (this.envService.get('NINEPAY_CHECKSUM_KEY') || ''))
                                .digest('hex')
                                .toUpperCase()
                        });
                    }
                    else if (result.status === 3 || result.status === 6) {
                        console.log(`[IPN Cron] Transaction ${tx.id} FAILED in 9Pay (status: ${result.status}). Simulating IPN failure.`);
                        await this.handleIpn({ headers: {}, socket: {} }, {
                            result: Buffer.from(JSON.stringify({
                                invoice_no: tx.id,
                                transaction_id: tx.id,
                                external_transaction_id: result.transaction_id || '',
                                status: 'FAILED'
                            })).toString('base64'),
                            checksum: crypto
                                .createHash('sha256')
                                .update(Buffer.from(JSON.stringify({
                                invoice_no: tx.id,
                                transaction_id: tx.id,
                                external_transaction_id: result.transaction_id || '',
                                status: 'FAILED'
                            })).toString('base64') + (this.envService.get('NINEPAY_CHECKSUM_KEY') || ''))
                                .digest('hex')
                                .toUpperCase()
                        });
                    }
                    else {
                        console.log(`[IPN Cron] Transaction ${tx.id} is still pending (status: ${result.status}).`);
                    }
                }
            }
        }
        catch (error) {
            console.error('[IPN Cron] Error polling pending_external:', error.message);
        }
    }
};
exports.IpnController = IpnController;
__decorate([
    (0, common_1.Post)(),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, ipn_dto_1.IpnDto]),
    __metadata("design:returntype", Promise)
], IpnController.prototype, "handleIpn", null);
__decorate([
    (0, schedule_1.Cron)(schedule_1.CronExpression.EVERY_5_MINUTES),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], IpnController.prototype, "pollPendingExternal", null);
exports.IpnController = IpnController = __decorate([
    (0, common_1.Controller)('ipn'),
    __metadata("design:paramtypes", [core_1.Sep31CoreService,
        stellar_1.AnchorRpcService,
        core_1.EnvService,
        banking_1.NinePayGatewayService])
], IpnController);
//# sourceMappingURL=ipn.controller.js.map