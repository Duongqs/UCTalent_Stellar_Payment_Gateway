import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { OracleSource } from './oracle-source.interface';

const SOURCE_TIMEOUT_MS = 5_000;

@Injectable()
export class ExchangeRateApiUsdSource implements OracleSource {
  name = 'exchangerate_api_usd';
  priority = 6;

  async fetch(): Promise<number> {
    const res = await axios.get(
      'https://open.er-api.com/v6/latest/USD',
      { timeout: SOURCE_TIMEOUT_MS }
    );
    const rate = res.data?.rates?.VND;
    if (!rate || typeof rate !== 'number') throw new Error('Invalid response');
    // Maintain the 1.015 multiplier from the old code if required, or is it needed?
    // The prompt says "Refactor... Giữ 4 source hiện có", which means maintain their logic.
    return rate * 1.015;
  }
}
