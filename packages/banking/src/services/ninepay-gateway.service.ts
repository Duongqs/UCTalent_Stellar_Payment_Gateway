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
    const key = this.envService.get('NINEPAY_MERCHANT_KEY');
    if (!key) throw new Error('NINEPAY_MERCHANT_KEY is not configured');
    return key;
  }

  private get secretKey(): string {
    const key = this.envService.get('NINEPAY_SECRET_KEY');
    if (!key) throw new Error('NINEPAY_SECRET_KEY is not configured');
    return key;
  }

  private get apiUrl(): string {
    const url = this.envService.get('NINEPAY_API_URL');
    if (!url) throw new Error('NINEPAY_API_URL is not configured');
    return url.replace(/\/+$/, '');
  }

  private buildCanonicalQuery(params: Record<string, string>): string {
    if (!params || Object.keys(params).length === 0) return '';
    const sortedParams: Record<string, string> = {};
    Object.keys(params).sort().forEach(key => {
      sortedParams[key] = params[key] || '';
    });
    return new URLSearchParams(sortedParams).toString();
  }

  private createSignature(method: string, path: string, time: string, params: Record<string, string>): string {
    const httpQuery = this.buildCanonicalQuery(params);
    let message = method.toUpperCase() + '\n' + this.apiUrl + path + '\n' + time;
    if (httpQuery) {
      message += '\n' + httpQuery;
    }
    const sig = crypto
      .createHmac('sha256', this.secretKey)
      .update(message, 'utf8')
      .digest('base64');
    return sig;
  }

  private buildAuthHeader(signature: string): string {
    return `Signature Algorithm=HS256,Credential=${this.merchantKey},SignedHeaders=,Signature=${signature}`;
  }

  private async request(method: string, path: string, params: Record<string, string> = {}) {
    if (this.envService.get('NINEPAY_MODE') === 'mock') {
      console.log(`[NinePayGateway Mock] Skipping real request to ${path}`);
      if (path === '/disbursement/check-account') {
        return { status: 5, account_name: 'MOCK ACCOUNT NAME' };
      }
      if (path === '/disbursement/create') {
        return { status: 5, error_code: null, message: 'Success' };
      }
      return { status: 5 };
    }

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

    try {
      const response = await axios(config);
      return response.data;
    } catch (error: any) {
      if (error.response) {
         console.error(`[9Pay HTTP Request Error] ${error.response.status}`);
      }
      throw error;
    }
  }


  async lookupAccount(
    accountNumber: string,
    bankCode: string,
    accountType: string = '0',
  ): Promise<string | null> {
    try {
      const requestId = crypto.randomUUID().replace(/-/g, '').substring(0, 30);
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
    if (this.envService.get('NINEPAY_MODE') === 'mock') {
      const mockPaymentNo = `MOCK-${Date.now()}`;
      console.log(`[NinePayGateway Mock] Skipping real disburse request for ${invoiceNo}, mock payment_no: ${mockPaymentNo}`);
      return { status: 5, error_code: null, message: 'Success', payment_no: mockPaymentNo, paymentNo: mockPaymentNo };
    }

    const accountName = await this.lookupAccount(accountNumber, bankCode);
    if (!accountName) {
      throw new Error(`RECONCILIATION_FAILED: Cannot lookup account ${accountNumber} at bank ${bankCode}`);
    }

    this.nameMatchingService.reconcileNames(kycName, accountName, invoiceNo);

    try {
      // Ensure PIT invoices get a unique request_id within the 30 char limit
      let shortInvoiceNo = invoiceNo.replace(/-/g, '').substring(0, 30);
      if (invoiceNo.endsWith('-PIT')) {
        shortInvoiceNo = invoiceNo.replace(/-/g, '').substring(0, 27) + 'PIT';
      }
      const params: Record<string, string> = {
        request_id: shortInvoiceNo,
        amount: String(amount),
        description: description,
        bank_code: bankCode,
        account_name: accountName,
        account_no: accountNumber,
        account_type: '0',
      };

      const result = await this.request('POST', '/disbursement/create', params);

      // Handle 702 Duplicate Request ID or creation error
      if ((result.status === 4 || result.status === 6) && String(result.error_code) === '702') {
        console.log(`[9Pay Disburse] 702 Duplicate/Error for ${shortInvoiceNo}, recovering status via checkStatus...`);
        const checkRes = await this.checkStatus(shortInvoiceNo);
        if (checkRes && (checkRes.status === 2 || checkRes.status === 5 || checkRes.status === 1 || checkRes.status === 3 || checkRes.status === 6)) {
          console.log(`[9Pay Disburse] Recovered 702 transaction! payment_no: ${checkRes.payment_no}, status: ${checkRes.status}`);
          return {
            ...checkRes,
            paymentNo: checkRes.payment_no ? String(checkRes.payment_no) : undefined,
            requestId: shortInvoiceNo,
          };
        } else {
          throw new Error(`9Pay Disbursement Failed (702 Recovery): [${checkRes?.error_code || '404'}] ${checkRes?.message || 'Transaction not found in 9Pay'}`);
        }
      }

      if (result.status === 2 || result.status === 5 || result.status === 1 || result.status === 3 || result.status === 6) {
        let paymentNo = result.payment_no ? String(result.payment_no) : undefined;
        
        if (!paymentNo && (result.status === 6 || result.status === 5)) {
           console.log(`[9Pay Disburse] Status ${result.status} received for ${shortInvoiceNo}, fetching real payment_no via checkStatus in 2s...`);
           await new Promise(resolve => setTimeout(resolve, 2000));
           const checkRes = await this.checkStatus(shortInvoiceNo);
           if (checkRes && checkRes.payment_no) {
             paymentNo = String(checkRes.payment_no);
             console.log(`[9Pay Disburse] Recovered real payment_no: ${paymentNo} via checkStatus`);
           }
        }

        if (!paymentNo && result.status === 6) {
          throw new Error(`9Pay Disbursement Failed: Transaction failed (status 6) and no payment_no could be recovered.`);
        }

        console.log(`[9Pay Disburse] Success/Pending for ${shortInvoiceNo}, payment_no: ${paymentNo}, status: ${result.status}`);
        return {
          ...result,
          paymentNo,
          requestId: shortInvoiceNo,
        };
      } else {
        throw new Error(`9Pay Disbursement Failed: [${result.error_code}] ${result.message || result.failure_reason || 'Unknown Error'}`);
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
