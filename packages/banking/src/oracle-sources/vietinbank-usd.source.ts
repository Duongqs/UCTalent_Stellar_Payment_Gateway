import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { OracleSource } from './oracle-source.interface';

const SOURCE_TIMEOUT_MS = 10_000;

@Injectable()
export class VietinbankUsdSource implements OracleSource {
  name = 'vietinbank';
  priority = 6;
  category: 'A' = 'A';
  weight = 3;

  async fetch(): Promise<number> {
    const res = await axios.get('https://www.vietinbank.vn/web/guest/ty-gia', { timeout: SOURCE_TIMEOUT_MS });
    const html = res.data as string;
    // Try to extract USD transfer rate from embedded JSON or table
    const jsonMatch = html.match(/\{[^}]*"USD"[^}]*\}/);
    if (jsonMatch) {
      try {
        const obj = JSON.parse(jsonMatch[0]);
        const rate = obj?.USD?.transfer || obj?.USD?.transferRate || obj?.transferUSD;
        if (rate && typeof rate === 'number') return rate;
      } catch {}
    }

    const match = html.match(/USD[\s\S]*?Transfer[\s\S]*?>([0-9.,]+)/i) || html.match(/USD[\s\S]*?>([0-9.,]+)\s*<\/td>/i);
    if (!match || !match[1]) throw new Error('Could not parse Vietinbank rate');
    const rate = parseFloat(match[1].replace(/,/g, ''));
    if (isNaN(rate) || rate <= 0) throw new Error('Parsed Vietinbank rate invalid');
    return rate;
  }
}
