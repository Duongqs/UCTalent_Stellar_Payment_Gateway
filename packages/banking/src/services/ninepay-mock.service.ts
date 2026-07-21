import { Injectable } from '@nestjs/common';
import axios from 'axios';
import * as crypto from 'crypto';
import { AnchorRpcService } from '@uc/stellar';
import { EnvService } from '@uc/core';

@Injectable()
export class NinePayMockService {
  constructor(
    private readonly envService: EnvService,
    private readonly anchorRpcService: AnchorRpcService
  ) {}

  async simulateDisbursement(transactionId: string, amount: number, invoiceNo: string, external_transaction_id: string) {
    console.log(`[Mock 9Pay] Initiating disbursement for invoice ${invoiceNo}, amount: ${amount} VND`);

    setTimeout(async () => {
      console.log(`[Mock 9Pay] Disbursement SUCCESS for invoice ${invoiceNo}`);

      let truncatedTxId = transactionId.replace(/-/g, '').substring(0, 30);
      if (transactionId.endsWith('-PIT')) {
        truncatedTxId = transactionId.replace(/-/g, '').substring(0, 27) + 'PIT';
      }
      const payload = {
        invoice_no: truncatedTxId,
        transaction_id: external_transaction_id,
        external_transaction_id,
        status: 'SUCCESS'
      };

      const payloadStr = JSON.stringify(payload);
      const resultB64 = Buffer.from(payloadStr).toString('base64');
      const expectedChecksum = crypto
        .createHash('sha256')
        .update(resultB64 + (this.envService.get('NINEPAY_CHECKSUM_KEY') || ''))
        .digest('hex')
        .toUpperCase();

      const base = (this.envService.get('STELLAR_API_BASE_URL') || 'http://localhost:8081').replace(/\/+$/, '');
      try {
        const res = await axios.post(`${base}/api/ipn`, {
          result: resultB64,
          checksum: expectedChecksum
        });
        console.log(`[Mock 9Pay] IPN callback sent for ${invoiceNo}: ${res.status} ${JSON.stringify(res.data)}`);
      } catch (err: any) {
        console.error('[Mock 9Pay] Failed to trigger IPN mock callback:', err.message);
      }
    }, 3000);
  }
}
