import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { EnvService } from '@uc/core';

@Injectable()
export class AnchorRpcService {
  constructor(private readonly envService: EnvService) {}

  private get platformUrl(): string {
    return this.envService.get('PLATFORM_SERVER_URL') || this.envService.get('ANCHOR_PLATFORM_URL') || 'http://localhost:8085';
  }

  private async patchTransaction(id: string, updates: any) {
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
      console.error(`Error in Anchor Platform API [PATCH /transactions]:`, error.response?.data || error.message);
      throw error;
    }
  }

  async notifyOnchainFundsReceived(transactionId: string, amount_in: string, stellar_transaction_id: string) {
    const usdcIssuer = this.envService.get('USDC_ISSUER') || 'G_DUMMY_ISSUER';
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
