import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import axios from 'axios';
import { NameMatchingService } from './name-matching.service';
import { EnvService } from '@uc/core';

@Injectable()
export class NinePayGatewayService {
  constructor(
    private readonly envService: EnvService,
    private readonly nameMatchingService: NameMatchingService
  ) {}

  private get merchantKey(): string {
    return this.envService.get('NINEPAY_MERCHANT_KEY') || 'sandbox_merchant';
  }

  private get secretKey(): string {
    return this.envService.get('NINEPAY_SECRET_KEY') || 'sandbox_secret';
  }

  private get apiUrl(): string {
    return (this.envService.get('NINEPAY_API_URL') || 'https://sand-payment.9pay.vn').replace(/\/+$/, '');
  }

  private buildCanonicalQuery(params: Record<string, string>): string {
    if (!params || Object.keys(params).length === 0) return '';
    return Object.keys(params).sort().map(key => {
      return key + '=' + (params[key] || '');
    }).join('&');
  }

  private createSignature(method: string, path: string, time: string, params: Record<string, string>): string {
    const httpQuery = this.buildCanonicalQuery(params);
    let message = method.toUpperCase() + '\n' + this.apiUrl + path + '\n' + time;
    if (httpQuery) {
      message += '\n' + httpQuery;
    }
    return crypto
      .createHmac('sha256', this.secretKey)
      .update(message, 'utf8')
      .digest('base64');
  }

  private buildAuthHeader(signature: string): string {
    return `Signature Algorithm=HS256,Credential=${this.merchantKey},SignedHeaders=,Signature=${signature}`;
  }

  private async request(method: string, path: string, params: Record<string, string> = {}) {
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

  async lookupAccount(
    accountNumber: string,
    bankCode: string,
    accountType: string = '0',
  ): Promise<string | null> {
    try {
      const requestId = crypto.randomUUID();
      const params = {
        request_id: requestId,
        bank_code: bankCode,
        account_no: accountNumber,
        account_type: accountType,
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

  async disburse(
    amount: number,
    invoiceNo: string,
    bankCode: string,
    accountNumber: string,
    description: string,
    kycName: string,
    complianceMeta?: Record<string, string>
  ) {
    const accountName = await this.lookupAccount(accountNumber, bankCode);
    if (!accountName) {
      throw new Error(`RECONCILIATION_FAILED: Cannot lookup account ${accountNumber} at bank ${bankCode}`);
    }

    this.nameMatchingService.reconcileNames(kycName, accountName, invoiceNo);

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

  async checkStatus(invoiceNo: string) {
    try {
      const params = { request_id: invoiceNo };
      const result = await this.request('POST', '/disbursement/check-transaction', params);
      return result;
    } catch (error: any) {
      console.error(`9Pay checkStatus Error for ${invoiceNo}:`, error.message);
      return null;
    }
  }
}
