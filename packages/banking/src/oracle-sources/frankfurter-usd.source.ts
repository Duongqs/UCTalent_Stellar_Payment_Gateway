import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { OracleSource } from './oracle-source.interface';

const SOURCE_TIMEOUT_MS = 5_000;

@Injectable()
export class FrankfurterUsdSource implements OracleSource {
  name = 'frankfurter';
  priority = 4;
  category: 'A' = 'A';
  weight = 1.5;

  async fetch(): Promise<number> {
    const res = await axios.get('https://api.frankfurter.app/latest', {
      params: { from: 'USD', to: 'VND' },
      timeout: SOURCE_TIMEOUT_MS,
    });
    const rate = res.data?.rates?.VND;
    if (!rate || typeof rate !== 'number') throw new Error('Invalid response');
    return rate;
  }
}
