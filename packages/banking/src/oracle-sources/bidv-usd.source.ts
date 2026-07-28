import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { OracleSource } from './oracle-source.interface';

const SOURCE_TIMEOUT_MS = 10_000;

@Injectable()
export class BidvUsdSource implements OracleSource {
  name = 'bidv';
  priority = 6;
  category: 'A' = 'A';
  weight = 3;

  async fetch(): Promise<number> {
    const res = await axios.get('https://www.bidv.com.vn/ServicesBIDV/ExchangeDetailServlet', { timeout: SOURCE_TIMEOUT_MS });
    const html = res.data as string;
    // Try to find USD Transfer rate in HTML table
    const match = html.match(/USD[\s\S]*?Transfer[\s\S]*?>([0-9.,]+)/i) || html.match(/USD[\s\S]*?>([0-9.,]+)\s*<\/td>/i);
    if (!match || !match[1]) throw new Error('Could not parse BIDV rate');
    const rate = parseFloat(match[1].replace(/,/g, ''));
    if (isNaN(rate) || rate <= 0) throw new Error('Parsed BIDV rate invalid');
    return rate;
  }
}
