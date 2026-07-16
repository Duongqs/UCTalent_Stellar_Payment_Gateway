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
exports.NinePayMockService = void 0;
const common_1 = require("@nestjs/common");
const axios_1 = __importDefault(require("axios"));
const crypto = __importStar(require("crypto"));
const stellar_1 = require("@uc/stellar");
const core_1 = require("@uc/core");
let NinePayMockService = class NinePayMockService {
    constructor(envService, anchorRpcService) {
        this.envService = envService;
        this.anchorRpcService = anchorRpcService;
    }
    async simulateDisbursement(transactionId, amount, invoiceNo, external_transaction_id) {
        console.log(`[Mock 9Pay] Initiating disbursement for invoice ${invoiceNo}, amount: ${amount} VND`);
        setTimeout(async () => {
            console.log(`[Mock 9Pay] Disbursement SUCCESS for invoice ${invoiceNo}`);
            const payload = {
                invoice_no: invoiceNo,
                transaction_id: transactionId,
                external_transaction_id,
                status: 'SUCCESS'
            };
            const payloadStr = JSON.stringify(payload);
            const resultB64 = Buffer.from(payloadStr).toString('base64');
            const expectedChecksum = crypto
                .createHash('sha256')
                .update(resultB64 + (this.envService.get('NINEPAY_CHECKSUM_KEY') || ''))
                .digest('hex')
                .toUpperCase();
            const apiPort = this.envService.get('PORT') || 8081;
            try {
                await axios_1.default.post(`http://localhost:${apiPort}/ipn`, {
                    result: resultB64,
                    checksum: expectedChecksum
                });
            }
            catch (err) {
                console.error('[Mock 9Pay] Failed to trigger IPN mock callback:', err.message);
            }
        }, 3000);
    }
};
exports.NinePayMockService = NinePayMockService;
exports.NinePayMockService = NinePayMockService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [core_1.EnvService,
        stellar_1.AnchorRpcService])
], NinePayMockService);
//# sourceMappingURL=ninepay-mock.service.js.map