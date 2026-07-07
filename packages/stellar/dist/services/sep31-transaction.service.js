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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Sep31TransactionService = void 0;
const common_1 = require("@nestjs/common");
const axios_1 = __importDefault(require("axios"));
const crypto = __importStar(require("crypto"));
let Sep31TransactionService = class Sep31TransactionService {
    constructor() {
        this.anchorUrl = process.env.ANCHOR_PLATFORM_URL || 'http://localhost:8082';
    }
    generateMockJwt() {
        const secret = 'super_secret_jwt_key_that_is_at_least_32_bytes_long!';
        const header = { alg: 'HS256', typ: 'JWT' };
        const payload = {
            iss: 'http://localhost:8080',
            sub: 'GBBD47IF6LWK7P7MDEVSCZA7CFYGLVOLO25E34XDBIEU7E5XPIUBIVGF',
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + 3600,
        };
        const encodeBase64Url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
        const data = `${encodeBase64Url(header)}.${encodeBase64Url(payload)}`;
        const signature = crypto.createHmac('sha256', secret).update(data).digest('base64url');
        return `${data}.${signature}`;
    }
    async createTransaction(payload) {
        try {
            const response = await axios_1.default.post(`${this.anchorUrl}/sep31/transactions`, {
                amount: payload.amount,
                asset_code: payload.asset_code || 'USDC',
                sender_id: payload.sender_id,
                receiver_id: payload.receiver_id,
                quote_id: payload.quote_id,
                funding_method: "stellar",
                fields: { transaction: { receiver_routing_number: "mock" } }
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.generateMockJwt()}`
                },
                timeout: 15000,
            });
            return response.data;
        }
        catch (error) {
            console.error('Error initiating SEP-31 transaction:', error.message);
            if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
                throw new Error('SEP-31 Anchor Platform timeout');
            }
            else if (error.response?.status === 400) {
                throw new Error(`SEP-31 Validation/KYC Error: ${JSON.stringify(error.response.data)}`);
            }
            else if (error.response?.status === 404) {
                throw new Error(`SEP-31 Quote not found or expired`);
            }
            throw error;
        }
    }
};
exports.Sep31TransactionService = Sep31TransactionService;
exports.Sep31TransactionService = Sep31TransactionService = __decorate([
    (0, common_1.Injectable)()
], Sep31TransactionService);
//# sourceMappingURL=sep31-transaction.service.js.map