import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { OracleSource } from './oracle-source.interface';

const SOURCE_TIMEOUT_MS = 10_000; // Increase timeout for VCB

@Injectable()
export class VietcombankSource implements OracleSource {
  name = 'vietcombank';
  isPrimary = true;
  priority = 9;

  async fetch(): Promise<number> {
    const res = await axios.get(
      'https://portal.vietcombank.com.vn/Usercontrols/TVPortal.TyGia/pXML.aspx',
      { timeout: SOURCE_TIMEOUT_MS }
    );
    
    if (typeof res.data !== 'string') {
      throw new Error('Invalid response from Vietcombank (expected XML string)');
    }

    // Parse the XML using a regex to find the USD Transfer rate
    // Example: <Exrate CurrencyCode="USD" CurrencyName="DOLLAR MỸ" Buy="25,120" Transfer="25,150" Sell="25,470" />
    const match = res.data.match(/<Exrate\s+[^>]*CurrencyCode="USD"[^>]*Transfer="([^"]+)"/i);
    
    if (!match || !match[1]) {
      throw new Error('Could not find USD Transfer rate in Vietcombank XML');
    }

    const transferRateString = match[1].replace(/,/g, '');
    const rate = parseFloat(transferRateString);
    
    if (isNaN(rate) || rate <= 0) {
      throw new Error(`Parsed Vietcombank rate is invalid: ${match[1]}`);
    }
    
    return rate;
  }
}
