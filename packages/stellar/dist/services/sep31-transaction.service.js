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
exports.Sep31TransactionService = void 0;
const common_1 = require("@nestjs/common");
const axios_1 = __importDefault(require("axios"));
const crypto = __importStar(require("crypto"));
const core_1 = require("@uc/core");
let Sep31TransactionService = class Sep31TransactionService {
    constructor(envService) {
        this.envService = envService;
    }
    get anchorUrl() {
        const url = this.envService.get('ANCHOR_PLATFORM_URL');
        if (!url)
            throw new Error('ANCHOR_PLATFORM_URL is missing');
        return url;
    }
    generateAuthJwt() {
        const secret = this.envService.get('JWT_SECRET');
        const header = { alg: 'HS256', typ: 'JWT' };
        const payload = {
            iss: this.envService.get('STELLAR_API_BASE_URL'),
            sub: this.envService.get('USDC_ISSUER'),
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + 3600,
        };
        const encodeBase64Url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
        const data = `${encodeBase64Url(header)}.${encodeBase64Url(payload)}`;
        const signature = crypto
            .createHmac('sha256', secret)
            .update(data)
            .digest('base64url');
        return `${data}.${signature}`;
    }
    async createTransaction(payload) {
        try {
            const response = await axios_1.default.post(`${this.anchorUrl}/sep31/transactions`, {
                amount: payload.amount,
                asset_code: payload.asset_code || 'USDC',
                asset_issuer: this.envService.get('USDC_ISSUER'),
                sender_id: payload.sender_id,
                receiver_id: payload.receiver_id,
                funding_method: 'stellar',
                destination_asset: 'iso4217:VND',
                fields: {
                    transaction: {
                        receiver_routing_number: payload.receiver_routing_number || 'N/A',
                        receiver_account_number: payload.receiver_account_number || 'N/A'
                    }
                },
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${this.generateAuthJwt()}`,
                },
                timeout: 15000,
            });
            return response.data;
        }
        catch (error) {
            console.error(`Error initiating SEP-31 transaction: code=${error.code}, status=${error.response?.status}`);
            if (error.response) {
                console.error(`Response status: ${error.response.status}, error: ${error.response.data?.error || 'N/A'}`);
            }
            if (error.code === 'ECONNABORTED' || (error.message && error.message.includes('timeout'))) {
                throw new Error('SEP-31 Anchor Platform timeout');
            }
            else if (error.response?.status === 400) {
                throw new Error(`SEP-31 Validation/KYC Error: ${JSON.stringify(error.response.data)}`);
            }
            else if (error.response?.status === 404) {
                throw new Error(`SEP-31 Quote not found or expired`);
            }
            if (!error.response &&
                (error.code === 'ECONNREFUSED' || (error.message && error.message.includes('ECONNREFUSED')))) {
                if (this.envService.get('USE_MOCK_IPN') === 'true') {
                    console.warn(`[Mock] Anchor Platform unreachable. Returning mock SEP-31 transaction.`);
                    const treasury = this.envService.get('PLATFORM_TREASURY_ADDRESS');
                    if (!treasury)
                        throw new Error('PLATFORM_TREASURY_ADDRESS is missing');
                    return {
                        id: crypto.randomUUID(),
                        stellar_account: treasury,
                        stellar_memo_type: 'text',
                        stellar_memo: crypto.randomBytes(16).toString('hex')
                    };
                }
            }
            if (!error.response) {
                throw new Error(`Anchor Platform error: ${error.message || 'Service unreachable'}`);
            }
            throw error;
        }
    }
};
exports.Sep31TransactionService = Sep31TransactionService;
exports.Sep31TransactionService = Sep31TransactionService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [core_1.EnvService])
], Sep31TransactionService);
//# sourceMappingURL=sep31-transaction.service.js.map