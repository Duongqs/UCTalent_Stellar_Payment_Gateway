import { OnModuleInit } from '@nestjs/common';
import { OracleSourceRegistry } from './oracle-sources/oracle-source.registry';
import { CoinGeckoUsdcSource } from './oracle-sources/coingecko-usdc.source';
import { CoinGeckoUsdtSource } from './oracle-sources/coingecko-usdt.source';
import { ExchangeRateApiUsdSource } from './oracle-sources/exchange-rate-api.source';
import { CurrencyApiUsdSource } from './oracle-sources/currency-api.source';
import { VietcombankSource } from './oracle-sources/vietcombank.source';
import { ExchangerateHostSource } from './oracle-sources/exchangerate-host.source';
export declare class BankingModule implements OnModuleInit {
    private readonly registry;
    private readonly coingeckoUsdc;
    private readonly coingeckoUsdt;
    private readonly exchangeRateApi;
    private readonly currencyApi;
    private readonly vietcombank;
    private readonly exchangerateHost;
    constructor(registry: OracleSourceRegistry, coingeckoUsdc: CoinGeckoUsdcSource, coingeckoUsdt: CoinGeckoUsdtSource, exchangeRateApi: ExchangeRateApiUsdSource, currencyApi: CurrencyApiUsdSource, vietcombank: VietcombankSource, exchangerateHost: ExchangerateHostSource);
    onModuleInit(): void;
}
