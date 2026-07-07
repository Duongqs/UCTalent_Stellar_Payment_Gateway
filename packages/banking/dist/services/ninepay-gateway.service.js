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
exports.NinePayGatewayService = void 0;
const common_1 = require("@nestjs/common");
const crypto = __importStar(require("crypto"));
const axios_1 = __importDefault(require("axios"));
const name_matching_service_1 = require("./name-matching.service");
let NinePayGatewayService = class NinePayGatewayService {
    constructor(nameMatchingService) {
        this.nameMatchingService = nameMatchingService;
        this.merchantKey = process.env.NINEPAY_MERCHANT_KEY || process.env.NINEPAY_MERCHANT_ID || 'sandbox_merchant';
        this.secretKey = process.env.NINEPAY_SECRET_KEY || 'sandbox_secret';
        this.apiUrl = (process.env.NINEPAY_API_URL || 'https://sand-payment.9pay.vn').replace(/\/+$/, '');
    }
    buildHttpQuery(params) {
        if (!params || Object.keys(params).length === 0)
            return '';
        return Object.keys(params).sort().map(key => {
            return encodeURIComponent(key) + '=' + encodeURIComponent(params[key] || '');
        }).join('&').replace(/%20/g, '+');
    }
    createSignature(method, path, time, params) {
        const httpQuery = this.buildHttpQuery(params);
        let message = method.toUpperCase() + '\n' + this.apiUrl + path + '\n' + time;
        if (httpQuery) {
            message += '\n' + httpQuery;
        }
        return crypto
            .createHmac('sha256', this.secretKey)
            .update(message, 'utf8')
            .digest('base64');
    }
    buildAuthHeader(signature) {
        return `Signature Algorithm=HS256,Credential=${this.merchantKey},SignedHeaders=,Signature=${signature}`;
    }
    async request(method, path, params = {}) {
        const time = Math.round(Date.now() / 1000).toString();
        const signature = this.createSignature(method, path, time, params);
        const authHeader = this.buildAuthHeader(signature);
        const config = {
            method,
            url: `${this.apiUrl}${path}`,
            headers: {
                'Authorization': authHeader,
                'Date': time,
                'Content-Type': method.toUpperCase() === 'POST' ? 'application/x-www-form-urlencoded' : 'application/json',
            },
            timeout: 15000,
        };
        if (method.toUpperCase() === 'GET') {
            config.params = params;
        }
        else {
            config.data = new URLSearchParams(params).toString();
        }
        const response = await (0, axios_1.default)(config);
        return response.data;
    }
    async lookupAccount(accountNumber, bankCode) {
        if (process.env.NINEPAY_MODE === 'mock' || process.env.USE_MOCK_NINEPAY === 'true') {
            console.log(`[Mock 9Pay] Lookup account ${accountNumber} at ${bankCode}`);
            if (accountNumber.includes('169969'))
                return 'NGUYEN VAN A';
            if (accountNumber.includes('170170'))
                return 'NGUYEN VAN B';
            return 'NGUYEN VAN A';
        }
        try {
            const requestId = crypto.randomUUID();
            const params = {
                request_id: requestId,
                bank_code: bankCode,
                account_no: accountNumber,
                account_type: '0',
            };
            const result = await this.request('POST', '/disbursement/check-account', params);
            if (result.status === 5 && result.account_name) {
                return result.account_name;
            }
            else {
                console.warn(`9Pay Lookup Failed: [${result.error_code}] ${result.message}`);
                return null;
            }
        }
        catch (error) {
            console.error('9Pay Lookup Error:', error.message);
            return null;
        }
    }
    async disburse(amount, invoiceNo, bankCode, accountNumber, description, kycName, complianceMeta) {
        const accountName = await this.lookupAccount(accountNumber, bankCode);
        if (!accountName) {
            throw new Error(`RECONCILIATION_FAILED: Cannot lookup account ${accountNumber} at bank ${bankCode}`);
        }
        this.nameMatchingService.reconcileNames(kycName, accountName, invoiceNo);
        if (process.env.NINEPAY_MODE === 'mock' || process.env.USE_MOCK_NINEPAY === 'true') {
            console.log(`[Mock 9Pay] Disbursed ${amount} VND for invoice ${invoiceNo} to account ${accountNumber}`);
            return { status: 5, message: 'Mock Success' };
        }
        try {
            const params = {
                request_id: invoiceNo,
                amount: String(amount),
                description: description,
                bank_code: bankCode,
                account_name: accountName,
                account_no: accountNumber,
                account_type: '0',
            };
            const result = await this.request('POST', '/disbursement/create', params);
            if (result.status === 2 || result.status === 5) {
                return result;
            }
            else {
                throw new Error(`9Pay Disbursement Failed: [${result.error_code}] ${result.message}`);
            }
        }
        catch (error) {
            console.error('9Pay Disbursement Error:', error.message);
            throw error;
        }
    }
};
exports.NinePayGatewayService = NinePayGatewayService;
exports.NinePayGatewayService = NinePayGatewayService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [name_matching_service_1.NameMatchingService])
], NinePayGatewayService);
//# sourceMappingURL=ninepay-gateway.service.js.map