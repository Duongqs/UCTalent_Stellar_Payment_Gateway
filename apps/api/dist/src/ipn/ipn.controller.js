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
Object.defineProperty(exports, "__esModule", { value: true });
exports.IpnController = void 0;
const common_1 = require("@nestjs/common");
const stellar_1 = require("@uc/stellar");
const core_1 = require("@uc/core");
const crypto = __importStar(require("crypto"));
let IpnController = class IpnController {
    async handleIpn(body) {
        const resultB64 = body.result;
        const receivedChecksum = body.checksum;
        if (!resultB64 || !receivedChecksum) {
            console.error('[IPN] Missing result or checksum');
            throw new common_1.UnauthorizedException('Invalid checksum');
        }
        const expectedChecksum = crypto
            .createHash('sha256')
            .update(resultB64 + (process.env.NINEPAY_CHECKSUM_KEY || ''))
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
            const existing = await (0, core_1.query)(`SELECT id FROM disbursement_audit_log
         WHERE transaction_id = $1 AND event_type = $2`, [transaction_id, `ipn_${status.toLowerCase()}`]);
            if (existing) {
                console.log(`[IPN] Duplicate ${status} for ${transaction_id}, skipping`);
                return { message: 'Already processed' };
            }
            switch (status) {
                case 'SUCCESS':
                    await stellar_1.AnchorRpcService.notifyOffchainFundsAvailable(transaction_id, external_transaction_id);
                    await (0, core_1.query)('UPDATE sep31_transactions SET status = $2, updated_at = now() WHERE id = $1', [transaction_id, 'completed']);
                    await (0, core_1.auditLog)(transaction_id, 'ipn_success', { external_transaction_id });
                    break;
                case 'FAILED': {
                    const tx = await (0, core_1.query)('SELECT retry_count FROM sep31_transactions WHERE id = $1', [transaction_id]);
                    const retryCount = tx?.retry_count ?? 0;
                    if (retryCount < 3) {
                        const nextRetryMs = Math.pow(2, retryCount) * 30_000;
                        await (0, core_1.query)('UPDATE sep31_transactions SET retry_count = retry_count + 1, updated_at = now() WHERE id = $1', [transaction_id]);
                        await (0, core_1.auditLog)(transaction_id, 'ipn_failed_retry', {
                            attempt: retryCount + 1,
                            next_retry_ms: nextRetryMs,
                        });
                        console.warn(`[IPN] FAILED for ${transaction_id}, retry ${retryCount + 1}/3 scheduled in ${nextRetryMs}ms`);
                    }
                    else {
                        await stellar_1.AnchorRpcService.notifyTransactionError(transaction_id, `Disbursement failed after 3 retries`);
                        await (0, core_1.query)(`UPDATE sep31_transactions SET status = 'error', error_message = $2, updated_at = now() WHERE id = $1`, [transaction_id, 'Max retries exceeded']);
                        await (0, core_1.auditLog)(transaction_id, 'ipn_failed_final', { reason: 'max_retries' });
                        console.error(`[ALERT:disbursement_failed] TX ${transaction_id} failed after 3 retries`);
                    }
                    break;
                }
                default:
                    console.warn(`[IPN] Unknown status '${status}' for ${transaction_id}`);
                    await (0, core_1.auditLog)(transaction_id, `ipn_unknown_${status}`, { raw_status: status });
                    break;
            }
            return { message: 'Acknowledged' };
        }
        catch (error) {
            console.error('[IPN] Error handling webhook:', error);
            throw new common_1.InternalServerErrorException('Internal server error');
        }
    }
};
exports.IpnController = IpnController;
__decorate([
    (0, common_1.Post)(),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], IpnController.prototype, "handleIpn", null);
exports.IpnController = IpnController = __decorate([
    (0, common_1.Controller)('ipn')
], IpnController);
//# sourceMappingURL=ipn.controller.js.map