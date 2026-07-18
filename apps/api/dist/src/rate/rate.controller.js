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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RateController = void 0;
const common_1 = require("@nestjs/common");
const banking_1 = require("@uc/banking");
const core_1 = require("@uc/core");
const uuid_1 = require("uuid");
let RateController = class RateController {
    firmQuoteService;
    oracleService;
    auditLog;
    envService;
    constructor(firmQuoteService, oracleService, auditLog, envService) {
        this.firmQuoteService = firmQuoteService;
        this.oracleService = oracleService;
        this.auditLog = auditLog;
        this.envService = envService;
    }
    async getInfo() {
        return {
            assets: [
                {
                    asset: `stellar:USDC:${this.envService.get('USDC_ISSUER') || 'G_DUMMY_ISSUER'}`,
                    buy_delivery_methods: [
                        { name: 'NAPAS', description: 'NAPAS 247 Instant Transfer' },
                    ],
                },
                {
                    asset: 'iso4217:VND',
                    country_codes: ['VN'],
                    buy_delivery_methods: [
                        { name: 'NAPAS', description: 'NAPAS 247 Instant Transfer' },
                    ],
                },
            ],
        };
    }
    async getRate(type, sell_asset, buy_asset, sell_amount, buy_amount, context, buy_delivery_method) {
        if (!type || (type !== 'indicative' && type !== 'firm')) {
            throw new common_1.BadRequestException('Valid type (indicative or firm) is required');
        }
        if (buy_delivery_method && buy_delivery_method !== 'NAPAS') {
            throw new common_1.BadRequestException('Unsupported buy_delivery_method. Only NAPAS is supported.');
        }
        let baseRate;
        try {
            const oracleResult = await this.oracleService.getSafeFxRate();
            baseRate = oracleResult.rate;
        }
        catch (apiError) {
            console.error('[Rate API] Oracle error:', apiError.message);
            throw new common_1.ServiceUnavailableException('Exchange rate service unavailable. Please try again later.');
        }
        if (!baseRate || typeof baseRate !== 'number' || Number.isNaN(baseRate) || baseRate <= 0) {
            throw new common_1.ServiceUnavailableException('Exchange rate service returned an invalid rate.');
        }
        const feeAmount = '0';
        const rateObj = {
            price: (1 / baseRate).toFixed(10).replace(/\.?0+$/, ''),
            fee: {
                total: feeAmount,
                asset: sell_asset ||
                    `stellar:USDC:${this.envService.get('USDC_ISSUER') || 'G_DUMMY_ISSUER'}`,
            },
        };
        if (sell_amount && buy_amount) {
            throw new common_1.BadRequestException('Please provide either sell_amount or buy_amount, but not both');
        }
        if (sell_amount) {
            rateObj.sell_amount = sell_amount;
            rateObj.buy_amount = Math.floor(parseFloat(sell_amount) * baseRate).toString();
        }
        else if (buy_amount) {
            rateObj.buy_amount = buy_amount;
            rateObj.sell_amount = (parseFloat(buy_amount) / baseRate)
                .toFixed(7)
                .replace(/\.?0+$/, '');
        }
        else {
            throw new common_1.BadRequestException('Either sell_amount or buy_amount must be provided');
        }
        if (type === 'firm') {
            if (!context || !['sep6', 'sep24', 'sep31'].includes(context)) {
                throw new common_1.BadRequestException('context must be one of sep6, sep24, or sep31 for firm quotes');
            }
            const quoteId = (0, uuid_1.v4)();
            const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
            const quote = this.firmQuoteService.create({
                id: quoteId,
                sellAsset: sell_asset ||
                    `stellar:USDC:${this.envService.get('USDC_ISSUER') || 'G_DUMMY_ISSUER'}`,
                buyAsset: buy_asset || 'iso4217:VND',
                sellAmount: rateObj.sell_amount.toString(),
                buyAmount: rateObj.buy_amount.toString(),
                rate: rateObj.price.toString(),
                context,
                expiresAt,
            });
            await this.firmQuoteService.save(quote);
            await this.auditLog.log(quoteId, 'quote_locked', {
                rate: rateObj.price,
                sell_amount: rateObj.sell_amount,
                buy_amount: rateObj.buy_amount,
                context,
            });
            rateObj.id = quoteId;
            rateObj.expires_at = expiresAt.toISOString();
        }
        return { rate: rateObj };
    }
};
exports.RateController = RateController;
__decorate([
    (0, common_1.Get)('info'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], RateController.prototype, "getInfo", null);
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Query)('type')),
    __param(1, (0, common_1.Query)('sell_asset')),
    __param(2, (0, common_1.Query)('buy_asset')),
    __param(3, (0, common_1.Query)('sell_amount')),
    __param(4, (0, common_1.Query)('buy_amount')),
    __param(5, (0, common_1.Query)('context')),
    __param(6, (0, common_1.Query)('buy_delivery_method')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String, String, String, String]),
    __metadata("design:returntype", Promise)
], RateController.prototype, "getRate", null);
exports.RateController = RateController = __decorate([
    (0, common_1.Controller)('rate'),
    __metadata("design:paramtypes", [core_1.FirmQuoteService,
        banking_1.OracleService,
        core_1.AuditLogService,
        core_1.EnvService])
], RateController);
//# sourceMappingURL=rate.controller.js.map