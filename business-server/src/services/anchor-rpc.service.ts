import axios from 'axios';

export class AnchorRpcService {
  private static platformUrl = process.env.PLATFORM_SERVER_URL || 'http://localhost:8085';

  private static async patchTransaction(id: string, updates: any) {
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
    } catch (error) {
      console.error(`Error in Anchor Platform API [PATCH /transactions]:`, error);
      throw error;
    }
  }

  static async notifyOnchainFundsReceived(transactionId: string, amount_in: string, stellar_transaction_id: string) {
    return this.patchTransaction(transactionId, {
      status: 'pending_receiver',
      stellar_transaction_id,
      amount_in: {
        amount: amount_in,
        asset: 'stellar:USDC:GBBD47IF6LWK7P7MDEVSCZA7CFYGLVOLO25E34XDBIEU7E5XPIUBIVGF'
      }
    });
  }

  static async notifyOffchainFundsPending(transactionId: string, external_transaction_id: string) {
    return this.patchTransaction(transactionId, {
      status: 'pending_external',
      external_transaction_id
    });
  }

  static async notifyOffchainFundsAvailable(transactionId: string, external_transaction_id: string) {
    return this.patchTransaction(transactionId, {
      status: 'completed',
      external_transaction_id
    });
  }

  static async notifyTransactionError(transactionId: string, message: string) {
    return this.patchTransaction(transactionId, {
      status: 'error',
      message
    });
  }
}
