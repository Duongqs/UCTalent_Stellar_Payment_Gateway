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
const core_1 = require("@uc/core");
let NinePayGatewayService = class NinePayGatewayService {
    constructor(envService, nameMatchingService) {
        this.envService = envService;
        this.nameMatchingService = nameMatchingService;
    }
    get merchantKey() {
        return this.envService.get('NINEPAY_MERCHANT_KEY') || 'sandbox_merchant';
    }
    get secretKey() {
        return this.envService.get('NINEPAY_SECRET_KEY') || 'sandbox_secret';
    }
    get apiUrl() {
        return (this.envService.get('NINEPAY_API_URL') || 'https://sand-payment.9pay.vn').replace(/\/+$/, '');
    }
    buildCanonicalQuery(params) {
        if (!params || Object.keys(params).length === 0)
            return '';
        const sortedParams = {};
        Object.keys(params).sort().forEach(key => {
            sortedParams[key] = params[key] || '';
        });
        return new URLSearchParams(sortedParams).toString();
    }
    createSignature(method, path, time, params) {
        const httpQuery = this.buildCanonicalQuery(params);
        let message = method.toUpperCase() + '\n' + this.apiUrl + path + '\n' + time;
        if (httpQuery) {
            message += '\n' + httpQuery;
        }
        console.log(`[9Pay Signature Debug] Message to sign for ${path}:\n---\n${message}\n---`);
        const sig = crypto
            .createHmac('sha256', this.secretKey)
            .update(message, 'utf8')
            .digest('base64');
        console.log(`[9Pay Signature Debug] Computed Signature: ${sig}`);
        return sig;
    }
    buildAuthHeader(signature) {
        return `Signature Algorithm=HS256,Credential=${this.merchantKey},SignedHeaders=,Signature=${signature}`;
    }
    async request(method, path, params = {}) {
        if (this.envService.get('NINEPAY_MODE') === 'mock') {
            console.log(`[NinePayGateway Mock] Skipping real request to ${path}`);
            if (path === '/disbursement/check-account') {
                return { status: 5, account_name: 'MOCK ACCOUNT NAME' };
            }
            if (path === '/disbursement/create') {
                return { status: 5, error_code: null, message: 'Success' };
            }
            return { status: 5 };
        }
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
            console.log(`[9Pay HTTP Request Debug] Body sent for ${path}:\n---\n${config.data}\n---`);
        }
        try {
            const response = await (0, axios_1.default)(config);
            return response.data;
        }
        catch (error) {
            if (error.response) {
                console.error(`[9Pay HTTP Request Error] ${error.response.status} - Data:`, JSON.stringify(error.response.data));
            }
            throw error;
        }
    }
    async lookupAccount(accountNumber, bankCode, accountType = '0') {
        try {
            const requestId = crypto.randomUUID().replace(/-/g, '').substring(0, 30);
            const params = {
                request_id: requestId,
                bank_code: bankCode,
                account_no: accountNumber,
                account_type: accountType,
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
        if (this.envService.get('NINEPAY_MODE') === 'mock') {
            const mockPaymentNo = `MOCK-${Date.now()}`;
            console.log(`[NinePayGateway Mock] Skipping real disburse request for ${invoiceNo}, mock payment_no: ${mockPaymentNo}`);
            return { status: 5, error_code: null, message: 'Success', payment_no: mockPaymentNo, paymentNo: mockPaymentNo };
        }
        const accountName = await this.lookupAccount(accountNumber, bankCode);
        if (!accountName) {
            throw new Error(`RECONCILIATION_FAILED: Cannot lookup account ${accountNumber} at bank ${bankCode}`);
        }
        this.nameMatchingService.reconcileNames(kycName, accountName, invoiceNo);
        try {
            let shortInvoiceNo = invoiceNo.replace(/-/g, '').substring(0, 30);
            if (invoiceNo.endsWith('-PIT')) {
                shortInvoiceNo = invoiceNo.replace(/-/g, '').substring(0, 27) + 'PIT';
            }
            const params = {
                request_id: shortInvoiceNo,
                amount: String(amount),
                description: description,
                bank_code: bankCode,
                account_name: accountName,
                account_no: accountNumber,
                account_type: '0',
            };
            const result = await this.request('POST', '/disbursement/create', params);
            if (result.status === 2 || result.status === 5) {
                const paymentNo = result.payment_no ? String(result.payment_no) : undefined;
                console.log(`[9Pay Disburse] Success for ${shortInvoiceNo}, payment_no: ${paymentNo}, status: ${result.status}`);
                return {
                    ...result,
                    paymentNo,
                    requestId: shortInvoiceNo,
                };
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
    async checkStatus(invoiceNo) {
        try {
            const params = { request_id: invoiceNo };
            const result = await this.request('POST', '/disbursement/check-transaction', params);
            return result;
        }
        catch (error) {
            console.error(`9Pay checkStatus Error for ${invoiceNo}:`, error.message);
            return null;
        }
    }
};
exports.NinePayGatewayService = NinePayGatewayService;
exports.NinePayGatewayService = NinePayGatewayService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [core_1.EnvService,
        name_matching_service_1.NameMatchingService])
], NinePayGatewayService);
//# sourceMappingURL=ninepay-gateway.service.js.map