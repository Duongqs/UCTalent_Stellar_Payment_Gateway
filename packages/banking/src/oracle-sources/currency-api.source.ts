import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { OracleSource } from './oracle-source.interface';

const SOURCE_TIMEOUT_MS = 5_000;

@Injectable()
export class CurrencyApiUsdSource implements OracleSource {
  name = 'currency_api_usd';
  priority = 6;

  async fetch(): Promise<number> {
    const res = await axios.get(
      'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json',
      { timeout: SOURCE_TIMEOUT_MS }
    );
    const rate = res.data?.usd?.vnd;
    if (!rate || typeof rate !== 'number') throw new Error('Invalid response');
    // Maintain the 1.015 multiplier from the old code
    return rate * 1.015;
  }
}
