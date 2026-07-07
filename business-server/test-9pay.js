require('dotenv/config');
const crypto = require('crypto');
const axios = require('axios');

class NinePayGatewayService {
  static merchantKey = process.env.NINEPAY_MERCHANT_KEY || process.env.NINEPAY_MERCHANT_ID || 'sandbox_merchant';
  static secretKey = process.env.NINEPAY_SECRET_KEY || 'sandbox_secret';
  static apiUrl = (process.env.NINEPAY_API_URL || 'https://sand-payment.9pay.vn').replace(/\/+$/, '');

  static buildHttpQuery(params) {
    if (!params || Object.keys(params).length === 0) return '';
    return Object.keys(params).sort().map(key => {
      return encodeURIComponent(key) + '=' + encodeURIComponent(params[key] || '');
    }).join('&').replace(/%20/g, '+');
  }

  static createSignature(method, path, time, params) {
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

  static buildAuthHeader(signature) {
    return `Signature Algorithm=HS256,Credential=${this.merchantKey},SignedHeaders=,Signature=${signature}`;
  }

  static async request(method, path, params = {}) {
    const time = Math.round(Date.now() / 1000).toString();
    const signature = this.createSignature(method, path, time, params);
    const authHeader = this.buildAuthHeader(signature);
    
    const config = {
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

  static async lookupAccount(accountNumber, bankCode) {
    try {
      const requestId = crypto.randomUUID();
      const params = {
        request_id: requestId,
        bank_code: bankCode,
        account_no: accountNumber,
        account_type: '0',
      };
      
      const result = await this.request('POST', '/disbursement/check-account', params);
      return result;
    } catch (error) {
      console.error('9Pay Lookup Error:', error.response ? error.response.data : error.message);
      return null;
    }
  }
}

async function run() {
  console.log('Merchant:', NinePayGatewayService.merchantKey);
  const result1 = await NinePayGatewayService.lookupAccount('2034030440000', 'BIDV');
  console.log('Result for 2034030440000 (Expected Fail according to docs):', result1);

  const result2 = await NinePayGatewayService.lookupAccount('99999999999999', 'BIDV');
  console.log('Result for 99999999999999:', result2);
}
run();
