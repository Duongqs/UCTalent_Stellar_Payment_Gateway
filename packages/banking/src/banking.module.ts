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
  ) {}

  onModuleInit() {
    this.registry.registerAll([
      this.coingeckoUsdc,
      this.coingeckoUsdt,
      this.exchangeRateApi,
      this.currencyApi,
      this.vietcombank,
      this.exchangerateHost,
    ]);
  }
}
