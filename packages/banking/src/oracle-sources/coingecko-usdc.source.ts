import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { OracleSource } from './oracle-source.interface';

const SOURCE_TIMEOUT_MS = 5_000;

@Injectable()
export class CoinGeckoUsdcSource implements OracleSource {
  name = 'coingecko_usdc';
  isPrimary = true;
  priority = 8;

  async fetch(): Promise<number> {
    const res = await axios.get(
      'https://api.coingecko.com/api/v3/simple/price',
      { params: { ids: 'usd-coin', vs_currencies: 'vnd' }, timeout: SOURCE_TIMEOUT_MS }
    );
    const rate = res.data?.['usd-coin']?.vnd;
    if (!rate || typeof rate !== 'number') throw new Error('Invalid response');
    return rate;
  }
}
