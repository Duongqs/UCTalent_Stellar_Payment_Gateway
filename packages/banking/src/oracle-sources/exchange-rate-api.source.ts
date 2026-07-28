import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { OracleSource } from './oracle-source.interface';

const SOURCE_TIMEOUT_MS = 5_000;

@Injectable()
export class ExchangeRateApiUsdSource implements OracleSource {
  name = 'exchangerate_api_usd';
  priority = 6;
  category: 'A' = 'A';
  weight = 1.5;

  async fetch(): Promise<number> {
    const res = await axios.get(
      'https://open.er-api.com/v6/latest/USD',
      { timeout: SOURCE_TIMEOUT_MS }
    );
    const rate = res.data?.rates?.VND;
    if (!rate || typeof rate !== 'number') throw new Error('Invalid response');
    return rate;
  }
}
