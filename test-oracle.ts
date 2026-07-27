import { OracleService } from './packages/banking/src/services/oracle.service';
import { OracleSourceRegistry } from './packages/banking/src/oracle-sources/oracle-source.registry';
import { CoinGeckoUsdcSource } from './packages/banking/src/oracle-sources/coingecko-usdc.source';
import { CoinGeckoUsdtSource } from './packages/banking/src/oracle-sources/coingecko-usdt.source';
import { ExchangeRateApiUsdSource } from './packages/banking/src/oracle-sources/exchange-rate-api.source';
import { CurrencyApiUsdSource } from './packages/banking/src/oracle-sources/currency-api.source';
import { VietcombankSource } from './packages/banking/src/oracle-sources/vietcombank.source';
import { ExchangerateHostSource } from './packages/banking/src/oracle-sources/exchangerate-host.source';

async function main() {
  const registry = new OracleSourceRegistry();
  
  const mockEnvService = {
    get: (key: string) => {
      switch (key) {
        case 'ORACLE_SOURCES': return 'vietcombank,coingecko_usdc,coingecko_usdt,exchangerate_api_usd,currency_api_usd,exchangerate_host';
        case 'ORACLE_OUTLIER_METHOD': return 'iqr';
        case 'ORACLE_MIN_VALID_SOURCES': return 3;
        case 'ORACLE_HARD_BOUND_MIN': return 23000;
        case 'ORACLE_HARD_BOUND_MAX': return 28000;
        case 'ORACLE_SAFETY_SPREAD': return 0.99;
        case 'ORACLE_CACHE_TTL_MS': return 0; // disable cache
        case 'EXCHANGERATE_HOST_API_KEY': return ''; // leave empty to test graceful fail
        default: return null;
      }
    }
  } as any;

  registry.registerAll([
    new CoinGeckoUsdcSource(),
    new CoinGeckoUsdtSource(),
    new ExchangeRateApiUsdSource(),
    new CurrencyApiUsdSource(),
    new VietcombankSource(),
    new ExchangerateHostSource(mockEnvService),
  ]);

  const oracleService = new OracleService(mockEnvService, registry);
  
  try {
    const result = await oracleService.getSafeFxRate();
    console.log('\n--- FINAL RESULT ---');
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('Error:', err);
  }
}

main();
