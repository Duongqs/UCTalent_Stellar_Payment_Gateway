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
    return (
      this.envService.get('ANCHOR_PLATFORM_URL') || 'http://localhost:8082'
    );
  }

  private generateAuthJwt(): string {
    const secret = this.envService.get('JWT_SECRET');
    const header = { alg: 'HS256', typ: 'JWT' };
    const payload = {
      iss: 'http://localhost:8080',
      sub: this.envService.get('USDC_ISSUER') || 'G_DUMMY_ISSUER',
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
          sender_id: payload.sender_id,
          receiver_id: payload.receiver_id,
          quote_id: payload.quote_id,
          funding_method: 'NAPAS',
          destination_asset: 'iso4217:VND',
          fields: { 
            transaction: { 
              receiver_routing_number: payload.receiver_routing_number || 'mock',
              receiver_account_number: payload.receiver_account_number || 'mock'
            } 
          },
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.generateAuthJwt()}`,
          },
          timeout: 15000,
        },
      );

      return response.data;
    } catch (error: any) {
      console.error('Error initiating SEP-31 transaction:', error.message);

      if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
        throw new Error('SEP-31 Anchor Platform timeout');
      } else if (error.response?.status === 400) {
        throw new Error(
          `SEP-31 Validation/KYC Error: ${JSON.stringify(error.response.data)}`,
        );
      } else if (error.response?.status === 404) {
        throw new Error(`SEP-31 Quote not found or expired`);
      }
      throw error;
    }
  }
}
