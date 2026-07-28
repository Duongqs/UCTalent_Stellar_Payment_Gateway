import { Module, Global, OnModuleInit } from '@nestjs/common';
import { StellarModule } from '@uc/stellar';
import { NinePayGatewayService } from './services/ninepay-gateway.service';
import { NinePayMockService } from './services/ninepay-mock.service';
import { OracleService } from './services/oracle.service';
import { BankVaultService } from './services/bank-vault.service';
import { NameMatchingService } from './services/name-matching.service';
import { OracleSourceRegistry } from './oracle-sources/oracle-source.registry';
import { CoinGeckoUsdcSource } from './oracle-sources/coingecko-usdc.source';
import { CoinGeckoUsdtSource } from './oracle-sources/coingecko-usdt.source';
import { ExchangeRateApiUsdSource } from './oracle-sources/exchange-rate-api.source';
import { CurrencyApiUsdSource } from './oracle-sources/currency-api.source';
import { VietcombankSource } from './oracle-sources/vietcombank.source';
import { ExchangerateHostSource } from './oracle-sources/exchangerate-host.source';
import { FrankfurterUsdSource } from './oracle-sources/frankfurter-usd.source';
import { CoinbasePegSource } from './oracle-sources/coinbase-peg.source';
import { BinancePegSource } from './oracle-sources/binance-peg.source';
import { OkxPegSource } from './oracle-sources/okx-peg.source';
import { BidvUsdSource } from './oracle-sources/bidv-usd.source';
import { VietinbankUsdSource } from './oracle-sources/vietinbank-usd.source';
import { TechcombankUsdSource } from './oracle-sources/techcombank-usd.source';

@Global()
@Module({
  imports: [StellarModule],
  providers: [
    NinePayGatewayService,
    NinePayMockService,
    OracleService,
    BankVaultService,
    NameMatchingService,
    OracleSourceRegistry,
    CoinGeckoUsdcSource,
    CoinGeckoUsdtSource,
    ExchangeRateApiUsdSource,
    CurrencyApiUsdSource,
    VietcombankSource,
    ExchangerateHostSource,
    FrankfurterUsdSource,
    CoinbasePegSource,
    BinancePegSource,
    OkxPegSource,
    BidvUsdSource,
    VietinbankUsdSource,
    TechcombankUsdSource,
  ],
  exports: [
    NinePayGatewayService,
    NinePayMockService,
    OracleService,
    BankVaultService,
    NameMatchingService,
    OracleSourceRegistry,
  ],
})
export class BankingModule implements OnModuleInit {
  constructor(
    private readonly registry: OracleSourceRegistry,
    private readonly coingeckoUsdc: CoinGeckoUsdcSource,
    private readonly coingeckoUsdt: CoinGeckoUsdtSource,
    private readonly exchangeRateApi: ExchangeRateApiUsdSource,
    private readonly currencyApi: CurrencyApiUsdSource,
    private readonly vietcombank: VietcombankSource,
    private readonly exchangerateHost: ExchangerateHostSource,
    private readonly frankfurterUsd: FrankfurterUsdSource,
    private readonly coinbasePeg: CoinbasePegSource,
    private readonly binancePeg: BinancePegSource,
    private readonly okxPeg: OkxPegSource,
    private readonly bidv: BidvUsdSource,
    private readonly vietinbank: VietinbankUsdSource,
    private readonly techcombank: TechcombankUsdSource,
  ) {}

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
}
