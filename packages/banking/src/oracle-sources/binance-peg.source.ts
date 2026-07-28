import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { OracleSource } from './oracle-source.interface';

const SOURCE_TIMEOUT_MS = 5_000;

@Injectable()
export class BinancePegSource implements OracleSource {
  name = 'binance_peg';
  priority = 7;
  category: 'C' = 'C';
  weight = 1.5;

  async fetch(): Promise<number> {
    const res = await axios.get('https://api.binance.com/api/v3/ticker/price', { params: { symbol: 'USDCUSDT' }, timeout: SOURCE_TIMEOUT_MS });
    const price = res.data?.price;
    const val = typeof price === 'string' ? parseFloat(price) : price;
    if (!val || typeof val !== 'number') throw new Error('Invalid response');
    return val;
  }
}
