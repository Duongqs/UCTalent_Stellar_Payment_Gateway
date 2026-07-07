import axios from 'axios';
import crypto from 'crypto';

export interface Sep31TransactionPayload {
  amount: string;
  asset_code: string;
  sender_id: string;
  receiver_id: string;
  quote_id?: string;
}

export class Sep31TransactionService {
  private static anchorUrl = process.env.ANCHOR_PLATFORM_URL || 'http://localhost:8082';

  /**
   * Generates a mock SEP-10 JWT for local testing.
   */
  private static generateMockJwt(): string {
    const secret = 'super_secret_jwt_key_that_is_at_least_32_bytes_long!';
    const header = { alg: 'HS256', typ: 'JWT' };
    const payload = {
      iss: 'http://localhost:8080',
      sub: 'GBBD47IF6LWK7P7MDEVSCZA7CFYGLVOLO25E34XDBIEU7E5XPIUBIVGF', // Sender client account
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    const encodeBase64Url = (obj: any) => Buffer.from(JSON.stringify(obj)).toString('base64url');
    const data = `${encodeBase64Url(header)}.${encodeBase64Url(payload)}`;
    const signature = crypto.createHmac('sha256', secret).update(data).digest('base64url');
    return `${data}.${signature}`;
  }

  /**
   * Initiates a SEP-31 transaction with the Anchor Platform.
   */
  static async createTransaction(payload: Sep31TransactionPayload) {
    try {
      // POST /sep31/transactions
      const response = await axios.post(`${this.anchorUrl}/sep31/transactions`, {
        amount: payload.amount,
        asset_code: payload.asset_code || 'USDC',
        sender_id: payload.sender_id,
        receiver_id: payload.receiver_id,
        quote_id: payload.quote_id,
        funding_method: "stellar",
        fields: { transaction: { receiver_routing_number: "mock" } }
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.generateMockJwt()}`
        },
        timeout: 15000,
      });

      return response.data; // { id, stellar_account, stellar_memo, ... }
    } catch (error: any) {
      console.error('Error initiating SEP-31 transaction:', error.message);
      
      // Classify error to help caller understand the failure reason
      if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
        throw new Error('SEP-31 Anchor Platform timeout');
      } else if (error.response?.status === 400) {
        throw new Error(`SEP-31 Validation/KYC Error: ${JSON.stringify(error.response.data)}`);
      } else if (error.response?.status === 404) {
        throw new Error(`SEP-31 Quote not found or expired`);
      }
      throw error;
    }
  }
}
