import axios from 'axios';
import crypto from 'crypto';
import { AnchorRpcService } from './anchor-rpc.service';

export class NinePayMockService {
  static async simulateDisbursement(transactionId: string, amount: number, invoiceNo: string, external_transaction_id: string) {
    console.log(`[Mock 9Pay] Initiating disbursement for invoice ${invoiceNo}, amount: ${amount} VND`);
    
    // Notify Anchor Platform that we are processing
    await AnchorRpcService.notifyOffchainFundsPending(transactionId, external_transaction_id);

    // Simulate bank processing delay of 3 seconds
    setTimeout(async () => {
      console.log(`[Mock 9Pay] Disbursement SUCCESS for invoice ${invoiceNo}`);
      
      const resultB64 = Buffer.from("mock_result").toString('base64');
      const expectedChecksum = crypto
        .createHash('sha256')
        .update(resultB64 + (process.env.NINEPAY_CHECKSUM_KEY || ''))
        .digest('hex')
        .toUpperCase();

      // Call our own IPN webhook to simulate 9Pay callback
      try {
        await axios.post('http://localhost:8081/ipn', {
          invoice_no: invoiceNo,
          transaction_id: transactionId,
          external_transaction_id,
          status: 'SUCCESS',
          result: resultB64,
          checksum: expectedChecksum
        });
      } catch (err) {
        console.error('[Mock 9Pay] Failed to trigger IPN mock callback', err);
      }
    }, 3000);
  }
}
