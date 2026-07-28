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
Object.defineProperty(exports, "__esModule", { value: true });
exports.BankingModule = void 0;
const common_1 = require("@nestjs/common");
const stellar_1 = require("@uc/stellar");
const ninepay_gateway_service_1 = require("./services/ninepay-gateway.service");
const ninepay_mock_service_1 = require("./services/ninepay-mock.service");
const oracle_service_1 = require("./services/oracle.service");
const bank_vault_service_1 = require("./services/bank-vault.service");
const name_matching_service_1 = require("./services/name-matching.service");
const oracle_source_registry_1 = require("./oracle-sources/oracle-source.registry");
const coingecko_usdc_source_1 = require("./oracle-sources/coingecko-usdc.source");
const coingecko_usdt_source_1 = require("./oracle-sources/coingecko-usdt.source");
const exchange_rate_api_source_1 = require("./oracle-sources/exchange-rate-api.source");
const currency_api_source_1 = require("./oracle-sources/currency-api.source");
const vietcombank_source_1 = require("./oracle-sources/vietcombank.source");
const exchangerate_host_source_1 = require("./oracle-sources/exchangerate-host.source");
const frankfurter_usd_source_1 = require("./oracle-sources/frankfurter-usd.source");
const coinbase_peg_source_1 = require("./oracle-sources/coinbase-peg.source");
const binance_peg_source_1 = require("./oracle-sources/binance-peg.source");
const okx_peg_source_1 = require("./oracle-sources/okx-peg.source");
const bidv_usd_source_1 = require("./oracle-sources/bidv-usd.source");
const vietinbank_usd_source_1 = require("./oracle-sources/vietinbank-usd.source");
const techcombank_usd_source_1 = require("./oracle-sources/techcombank-usd.source");
let BankingModule = class BankingModule {
    constructor(registry, coingeckoUsdc, coingeckoUsdt, exchangeRateApi, currencyApi, vietcombank, exchangerateHost, frankfurterUsd, coinbasePeg, binancePeg, okxPeg, bidv, vietinbank, techcombank) {
        this.registry = registry;
        this.coingeckoUsdc = coingeckoUsdc;
        this.coingeckoUsdt = coingeckoUsdt;
        this.exchangeRateApi = exchangeRateApi;
        this.currencyApi = currencyApi;
        this.vietcombank = vietcombank;
        this.exchangerateHost = exchangerateHost;
        this.frankfurterUsd = frankfurterUsd;
        this.coinbasePeg = coinbasePeg;
        this.binancePeg = binancePeg;
        this.okxPeg = okxPeg;
        this.bidv = bidv;
        this.vietinbank = vietinbank;
        this.techcombank = techcombank;
    }
    onModuleInit() {
        this.registry.registerAll([
            this.coingeckoUsdc,
            this.coingeckoUsdt,
            this.exchangeRateApi,
            this.currencyApi,
            this.vietcombank,
            this.exchangerateHost,
            this.frankfurterUsd,
            this.coinbasePeg,
            this.binancePeg,
            this.okxPeg,
            this.bidv,
            this.vietinbank,
            this.techcombank,
        ]);
    }
};
exports.BankingModule = BankingModule;
exports.BankingModule = BankingModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        imports: [stellar_1.StellarModule],
        providers: [
            ninepay_gateway_service_1.NinePayGatewayService,
            ninepay_mock_service_1.NinePayMockService,
            oracle_service_1.OracleService,
            bank_vault_service_1.BankVaultService,
            name_matching_service_1.NameMatchingService,
            oracle_source_registry_1.OracleSourceRegistry,
            coingecko_usdc_source_1.CoinGeckoUsdcSource,
            coingecko_usdt_source_1.CoinGeckoUsdtSource,
            exchange_rate_api_source_1.ExchangeRateApiUsdSource,
            currency_api_source_1.CurrencyApiUsdSource,
            vietcombank_source_1.VietcombankSource,
            exchangerate_host_source_1.ExchangerateHostSource,
            frankfurter_usd_source_1.FrankfurterUsdSource,
            coinbase_peg_source_1.CoinbasePegSource,
            binance_peg_source_1.BinancePegSource,
            okx_peg_source_1.OkxPegSource,
            bidv_usd_source_1.BidvUsdSource,
            vietinbank_usd_source_1.VietinbankUsdSource,
            techcombank_usd_source_1.TechcombankUsdSource,
        ],
        exports: [
            ninepay_gateway_service_1.NinePayGatewayService,
            ninepay_mock_service_1.NinePayMockService,
            oracle_service_1.OracleService,
            bank_vault_service_1.BankVaultService,
            name_matching_service_1.NameMatchingService,
            oracle_source_registry_1.OracleSourceRegistry,
        ],
    }),
    __metadata("design:paramtypes", [oracle_source_registry_1.OracleSourceRegistry,
        coingecko_usdc_source_1.CoinGeckoUsdcSource,
        coingecko_usdt_source_1.CoinGeckoUsdtSource,
        exchange_rate_api_source_1.ExchangeRateApiUsdSource,
        currency_api_source_1.CurrencyApiUsdSource,
        vietcombank_source_1.VietcombankSource,
        exchangerate_host_source_1.ExchangerateHostSource,
        frankfurter_usd_source_1.FrankfurterUsdSource,
        coinbase_peg_source_1.CoinbasePegSource,
        binance_peg_source_1.BinancePegSource,
        okx_peg_source_1.OkxPegSource,
        bidv_usd_source_1.BidvUsdSource,
        vietinbank_usd_source_1.VietinbankUsdSource,
        techcombank_usd_source_1.TechcombankUsdSource])
], BankingModule);
//# sourceMappingURL=banking.module.js.map