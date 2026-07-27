import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { EnvService } from '@uc/core';
import { OracleSource } from './oracle-source.interface';

const SOURCE_TIMEOUT_MS = 5_000;

@Injectable()
export class ExchangerateHostSource implements OracleSource {
  name = 'exchangerate_host';
  priority = 6;

  constructor(private readonly envService: EnvService) {}

  async fetch(): Promise<number> {
    const apiKey = this.envService.get('EXCHANGERATE_HOST_API_KEY');
    if (!apiKey) {
      throw new Error('EXCHANGERATE_HOST_API_KEY is not configured');
    }

    const res = await axios.get(
      'https://api.exchangerate.host/live',
      { params: { access_key: apiKey, source: 'USD', currencies: 'VND' }, timeout: SOURCE_TIMEOUT_MS }
    );
    
    // Check if the API returned an error
    if (res.data?.success === false) {
      throw new Error(`API Error: ${res.data?.error?.info || 'Unknown error'}`);
    }

    // According to docs, the live endpoint returns quotes like { "USDVND": 25000 }
    const rate = res.data?.quotes?.USDVND;
    if (!rate || typeof rate !== 'number') throw new Error('Invalid response');
    
    return rate;
  }
}
