import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { OracleSource } from './oracle-source.interface';

const SOURCE_TIMEOUT_MS = 5_000;

@Injectable()
export class OkxPegSource implements OracleSource {
  name = 'okx_peg';
  priority = 7;
  category: 'C' = 'C';
  weight = 1.5;

  async fetch(): Promise<number> {
    const res = await axios.get('https://www.okx.com/api/v5/market/ticker', { params: { instId: 'USDC-USDT' }, timeout: SOURCE_TIMEOUT_MS });
    const data = res.data?.data?.[0]?.last;
    const val = typeof data === 'string' ? parseFloat(data) : data;
    if (!val || typeof val !== 'number') throw new Error('Invalid response');
    return val;
  }
}
