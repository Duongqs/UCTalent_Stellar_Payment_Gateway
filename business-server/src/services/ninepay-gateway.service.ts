import * as crypto from 'crypto';
import axios from 'axios';
import { NameMatchingService } from './name-matching.service';

export class NinePayGatewayService {
  private static merchantKey = process.env.NINEPAY_MERCHANT_KEY || process.env.NINEPAY_MERCHANT_ID || 'sandbox_merchant';
  private static secretKey = process.env.NINEPAY_SECRET_KEY || 'sandbox_secret';
  private static apiUrl = (process.env.NINEPAY_API_URL || 'https://sand-payment.9pay.vn').replace(/\/+$/, '');

  private static buildHttpQuery(params: Record<string, string>): string {
    if (!params || Object.keys(params).length === 0) return '';
    return Object.keys(params).sort().map(key => {
      return encodeURIComponent(key) + '=' + encodeURIComponent(params[key] || '');
    }).join('&').replace(/%20/g, '+');
  }

  private static createSignature(method: string, path: string, time: string, params: Record<string, string>): string {
    const httpQuery = this.buildHttpQuery(params);
    let message = method.toUpperCase() + '\n' + this.apiUrl + path + '\n' + time;
    if (httpQuery) {
      message += '\n' + httpQuery;
    }
    return crypto
      .createHmac('sha256', this.secretKey)
      .update(message, 'utf8')
      .digest('base64');
  }

  private static buildAuthHeader(signature: string): string {
    return `Signature Algorithm=HS256,Credential=${this.merchantKey},SignedHeaders=,Signature=${signature}`;
  }

  private static async request(method: string, path: string, params: Record<string, string> = {}) {
    const time = Math.round(Date.now() / 1000).toString();
    const signature = this.createSignature(method, path, time, params);
    const authHeader = this.buildAuthHeader(signature);
    
    const config: any = {
      method,
      url: `${this.apiUrl}${path}`,
      headers: {
        'Authorization': authHeader,
        'Date': time,
        'Content-Type': method.toUpperCase() === 'POST' ? 'application/x-www-form-urlencoded' : 'application/json',
      },
      timeout: 15000,
    };

    if (method.toUpperCase() === 'GET') {
      config.params = params;
    } else {
      config.data = new URLSearchParams(params).toString();
    }

    const response = await axios(config);
    return response.data;
  }

  static async lookupAccount(accountNumber: string, bankCode: string): Promise<string | null> {
    try {
      const requestId = crypto.randomUUID();
      const params = {
        request_id: requestId,
        bank_code: bankCode,
        account_no: accountNumber,
        account_type: '0',
      };
      
      const result = await this.request('POST', '/disbursement/check-account', params);
      
      if (result.status === 5 && result.account_name) {
        return result.account_name;
      } else {
        console.warn(`9Pay Lookup Failed: [${result.error_code}] ${result.message}`);
        return null;
      }
    } catch (error: any) {
      console.error('9Pay Lookup Error:', error.message);
      return null;
    }
  }

  static async disburse(
    amount: number,
    invoiceNo: string,
    bankCode: string,
    accountNumber: string,
    description: string,
    kycName: string,
    complianceMeta?: Record<string, string>
  ) {
    // 1. Regulatory Compliance (Task 5.3): Account Lookup & Name Matching
    const accountName = await this.lookupAccount(accountNumber, bankCode);
    if (!accountName) {
      throw new Error(`RECONCILIATION_FAILED: Cannot lookup account ${accountNumber} at bank ${bankCode}`);
    }

    // 2. Perform reconciliation
    NameMatchingService.reconcileNames(kycName, accountName, invoiceNo);

    // 3. Proceed with Disbursement
    try {
      const params: Record<string, string> = {
        request_id: invoiceNo,
        amount: String(amount),
        description: description,
        bank_code: bankCode,
        account_name: accountName,
        account_no: accountNumber,
        account_type: '0',
      };
      
      const result = await this.request('POST', '/disbursement/create', params);
      
      if (result.status === 2 || result.status === 5) {
        return result;
      } else {
        throw new Error(`9Pay Disbursement Failed: [${result.error_code}] ${result.message}`);
      }
    } catch (error: any) {
      console.error('9Pay Disbursement Error:', error.message);
      throw error;
    }
  }
}
