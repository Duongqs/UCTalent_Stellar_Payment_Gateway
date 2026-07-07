import { Injectable } from '@nestjs/common';
import axios from 'axios';
import * as crypto from 'crypto';
import { AnchorRpcService } from '@uc/stellar';

@Injectable()
export class NinePayMockService {
  constructor(
    private readonly anchorRpcService: AnchorRpcService
  ) {}

  async simulateDisbursement(transactionId: string, amount: number, invoiceNo: string, external_transaction_id: string) {
    console.log(`[Mock 9Pay] Initiating disbursement for invoice ${invoiceNo}, amount: ${amount} VND`);

    await this.anchorRpcService.notifyOffchainFundsPending(transactionId, external_transaction_id);

    setTimeout(async () => {
      console.log(`[Mock 9Pay] Disbursement SUCCESS for invoice ${invoiceNo}`);

      const payload = {
        invoice_no: invoiceNo,
        transaction_id: transactionId,
        external_transaction_id,
        status: 'SUCCESS'
      };

      const payloadStr = JSON.stringify(payload);
      const resultB64 = Buffer.from(payloadStr).toString('base64');
      const expectedChecksum = crypto
        .createHash('sha256')
        .update(resultB64 + (process.env.NINEPAY_CHECKSUM_KEY || ''))
        .digest('hex')
        .toUpperCase();

      const apiPort = process.env.PORT || '8081';
      try {
        await axios.post(`http://localhost:${apiPort}/ipn`, {
          result: resultB64,
          checksum: expectedChecksum
        });
      } catch (err: any) {
        console.error('[Mock 9Pay] Failed to trigger IPN mock callback:', err.message);
      }
    }, 3000);
  }
}
