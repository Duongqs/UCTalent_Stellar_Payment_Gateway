import { Injectable } from '@nestjs/common';
import axios from 'axios';
import * as crypto from 'crypto';
import { EnvService } from '@uc/core';

export interface Sep31TransactionPayload {
  amount: string;
  asset_code: string;
  sender_id: string;
  receiver_id: string;
  quote_id?: string;
  receiver_routing_number?: string;
  receiver_account_number?: string;
}

@Injectable()
export class Sep31TransactionService {
  constructor(private readonly envService: EnvService) {}

  private get anchorUrl(): string {
    const url = this.envService.get('ANCHOR_PLATFORM_URL');
    if (!url) throw new Error('ANCHOR_PLATFORM_URL is missing');
    return url;
  }

  private generateAuthJwt(): string {
    const secret = this.envService.get('JWT_SECRET');
    const header = { alg: 'HS256', typ: 'JWT' };
    const payload = {
      iss: this.envService.get('STELLAR_API_BASE_URL'),
      sub: this.envService.get('USDC_ISSUER'),
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    const encodeBase64Url = (obj: any) =>
      Buffer.from(JSON.stringify(obj)).toString('base64url');
    const data = `${encodeBase64Url(header)}.${encodeBase64Url(payload)}`;
    const signature = crypto
      .createHmac('sha256', secret)
      .update(data)
      .digest('base64url');
    return `${data}.${signature}`;
  }

  async createTransaction(payload: Sep31TransactionPayload) {
    try {
      const response = await axios.post(
        `${this.anchorUrl}/sep31/transactions`,
        {
          amount: payload.amount,
          asset_code: payload.asset_code || 'USDC',
          asset_issuer: this.envService.get('USDC_ISSUER'),
          sender_id: payload.sender_id,
          receiver_id: payload.receiver_id,
          // no quote_id — AP does not support SEP-38 quotes (quotes_supported: false)
          funding_method: 'stellar',
          destination_asset: 'iso4217:VND',
          fields: { 
            transaction: { 
              receiver_routing_number: payload.receiver_routing_number || 'N/A',
              receiver_account_number: payload.receiver_account_number || 'N/A'
            } 
          },
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.generateAuthJwt()}`,
          },
          timeout: 15000,
        }
      );
      return response.data;
    } catch (error: any) {
      console.error(
        `Error initiating SEP-31 transaction: code=${error.code}, status=${error.response?.status}`
      );
      if (error.response) {
        console.error(`Response status: ${error.response.status}, error: ${error.response.data?.error || 'N/A'}`);
      }

      if (error.code === 'ECONNABORTED' || (error.message && error.message.includes('timeout'))) {
        throw new Error('SEP-31 Anchor Platform timeout');
      } else if (error.response?.status === 400) {
        throw new Error(
          `SEP-31 Validation/KYC Error: ${JSON.stringify(error.response.data)}`,
        );
      } else if (error.response?.status === 404) {
        throw new Error(`SEP-31 Quote not found or expired`);
      }

      if (
        !error.response &&
        (error.code === 'ECONNREFUSED' || (error.message && error.message.includes('ECONNREFUSED')))
      ) {
        if (this.envService.get('USE_MOCK_IPN') === 'true') {
          console.warn(`[Mock] Anchor Platform unreachable. Returning mock SEP-31 transaction.`);
          const treasury = this.envService.get('PLATFORM_TREASURY_ADDRESS');
          if (!treasury) throw new Error('PLATFORM_TREASURY_ADDRESS is missing');
          return {
            id: crypto.randomUUID(),
            stellar_account: treasury,
            stellar_memo_type: 'text',
            stellar_memo: crypto.randomBytes(16).toString('hex')
          };
        }
      }

      if (!error.response) {
        throw new Error(`Anchor Platform error: ${error.message || 'Service unreachable'}`);
      }
      throw error;
    }
  }
}

