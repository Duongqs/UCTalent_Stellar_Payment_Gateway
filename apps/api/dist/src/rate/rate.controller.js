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
    async getRate(type, sell_asset, buy_asset, sell_amount, buy_amount, context, buy_delivery_method) {
        if (!type || (type !== 'indicative' && type !== 'firm')) {
            throw new common_1.BadRequestException('Valid type (indicative or firm) is required');
        }
        if (buy_delivery_method && buy_delivery_method !== 'NAPAS') {
            throw new common_1.BadRequestException('Unsupported buy_delivery_method. Only NAPAS is supported.');
        }
        let baseRate;
        try {
            const oracleResult = await (0, banking_1.getSafeFxRate)();
            baseRate = oracleResult.rate;
        }
        catch (apiError) {
            console.error('[Rate API] Oracle error:', apiError.message);
            throw new common_1.ServiceUnavailableException('Exchange rate service unavailable. Please try again later.');
        }
        const feeAmount = '0';
        const rateObj = {
            price: (1 / baseRate).toFixed(10).replace(/\.?0+$/, ''),
            fee: {
                total: feeAmount,
                asset: sell_asset || 'stellar:USDC:GBBD47IF6LWK7P7MDEVSCZA7CFYGLVOLO25E34XDBIEU7E5XPIUBIVGF',
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
            rateObj.sell_amount = (parseFloat(buy_amount) / baseRate).toFixed(7).replace(/\.?0+$/, '');
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
            await (0, core_1.query)(`INSERT INTO firm_quotes (id, sell_asset, buy_asset, sell_amount, buy_amount, rate, context, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, [
                quoteId,
                sell_asset || 'stellar:USDC:GBBD47IF6LWK7P7MDEVSCZA7CFYGLVOLO25E34XDBIEU7E5XPIUBIVGF',
                buy_asset || 'iso4217:VND',
                rateObj.sell_amount,
                rateObj.buy_amount,
                rateObj.price,
                context,
                expiresAt,
            ]);
            await (0, core_1.auditLog)(quoteId, 'quote_locked', {
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
    async getQuote(id) {
        const quote = await (0, core_1.query)('SELECT * FROM firm_quotes WHERE id = $1', [id]);
        if (!quote) {
            throw new common_1.NotFoundException('Quote not found');
        }
        if (quote.expires_at && new Date(quote.expires_at) < new Date()) {
            throw new common_1.BadRequestException('Quote expired');
        }
        if (quote.used_at) {
            throw new common_1.ConflictException('Quote already used');
        }
        return {
            id: quote.id,
            price: (parseFloat(quote.sell_amount) / parseFloat(quote.buy_amount)).toFixed(10).replace(/\.?0+$/, ''),
            sell_asset: quote.sell_asset,
            buy_asset: quote.buy_asset,
            sell_amount: quote.sell_amount,
            buy_amount: quote.buy_amount,
            expires_at: quote.expires_at,
            fee: {
                total: '0',
                asset: quote.sell_asset
            }
        };
    }
};
exports.RateController = RateController;
__decorate([
    (0, common_1.Get)('rate'),
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
__decorate([
    (0, common_1.Get)('quote/:id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], RateController.prototype, "getQuote", null);
exports.RateController = RateController = __decorate([
    (0, common_1.Controller)()
], RateController);
//# sourceMappingURL=rate.controller.js.map