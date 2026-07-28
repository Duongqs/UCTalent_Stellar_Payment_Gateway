import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { EnvService } from '@uc/core';

@Injectable()
export class AnchorRpcService {
  constructor(private readonly envService: EnvService) {}

  private get platformUrl(): string {
    const url = this.envService.get('PLATFORM_SERVER_URL') || this.envService.get('ANCHOR_PLATFORM_URL');
    if (!url) throw new Error('PLATFORM_SERVER_URL is missing');
    return url;
  }

  private async patchTransaction(id: string, updates: any, retryCount = 0): Promise<any> {
    try {
      const response = await axios.patch(`${this.platformUrl}/transactions`, {
        records: [
          {
            transaction: {
              id,
              ...updates
            }
          }
        ]
      }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000,
      });

      return response.data;
    } catch (error: any) {
      const errorMsg = error.response?.data?.error || error.message;
      if (
        retryCount < 3 && 
        errorMsg && 
        errorMsg.includes('modified by another request')
      ) {
        console.warn(`[AnchorRpcService] Concurrency error on PATCH /transactions for ${id}. Retrying (${retryCount + 1}/3) in 500ms...`);
        await new Promise(resolve => setTimeout(resolve, 500));
        return this.patchTransaction(id, updates, retryCount + 1);
      }
      
      if (
        (error.code === 'ECONNREFUSED' || error.code === 'ECONNABORTED' || (error.message && (error.message.includes('ECONNREFUSED') || error.message.includes('ECONNABORTED')))) &&
        this.envService.get('USE_MOCK_IPN') === 'true'
      ) {
        console.warn(`[Mock] Skipping Anchor Platform PATCH /transactions for ${id} due to mock mode.`);
        return { mock: true };
      }
      console.error(`Error in Anchor Platform API [PATCH /transactions]:`, error.response?.data || error.message, error);
      throw error;
    }
  }

  async notifyOnchainFundsReceived(transactionId: string, amount_in: string, stellar_transaction_id: string) {
    const usdcIssuer = this.envService.get('USDC_ISSUER');
    return this.patchTransaction(transactionId, {
      status: 'pending_receiver',
      stellar_transaction_id,
      amount_in: {
        amount: amount_in,
        asset: `stellar:USDC:${usdcIssuer}`
      }
    });
  }

  async notifyOffchainFundsPending(transactionId: string, external_transaction_id: string) {
    return this.patchTransaction(transactionId, {
      status: 'pending_external',
      external_transaction_id
    });
  }

  async notifyOffchainFundsAvailable(transactionId: string, external_transaction_id: string) {
    return this.patchTransaction(transactionId, {
      status: 'completed',
      external_transaction_id
    });
  }

  async notifyTransactionError(transactionId: string, message: string) {
    return this.patchTransaction(transactionId, {
      status: 'error',
      message
    });
  }
}
