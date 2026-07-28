import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { OracleSource } from './oracle-source.interface';

const SOURCE_TIMEOUT_MS = 5_000;

@Injectable()
export class CoinbasePegSource implements OracleSource {
  name = 'coinbase_peg';
  priority = 7;
  category: 'C' = 'C';
  weight = 1.5;

  async fetch(): Promise<number> {
    const res = await axios.get('https://api.coinbase.com/v2/prices/USDC-USD/spot', { timeout: SOURCE_TIMEOUT_MS });
    const amount = res.data?.data?.amount;
    const val = typeof amount === 'string' ? parseFloat(amount) : amount;
    if (!val || typeof val !== 'number') throw new Error('Invalid response');
    return val;
  }
}
