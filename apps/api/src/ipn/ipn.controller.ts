import { 
  Controller, 
  Post, 
  Body, 
  HttpCode, 
  HttpStatus, 
  UnauthorizedException, 
  InternalServerErrorException 
} from '@nestjs/common';
import { AnchorRpcService } from '@uc/stellar';
import { query, auditLog } from '@uc/core';
import * as crypto from 'crypto';

@Controller('ipn')
export class IpnController {
  @Post()
  @HttpCode(HttpStatus.OK)
  async handleIpn(@Body() body: { result?: string; checksum?: string }) {
    const resultB64 = body.result;
    const receivedChecksum = body.checksum;

    if (!resultB64 || !receivedChecksum) {
      console.error('[IPN] Missing result or checksum');
      throw new UnauthorizedException('Invalid checksum');
    }

    const expectedChecksum = crypto
      .createHash('sha256')
      .update(resultB64 + (process.env.NINEPAY_CHECKSUM_KEY || ''))
      .digest('hex')
      .toUpperCase();

    if (receivedChecksum !== expectedChecksum) {
      console.error('[IPN] Invalid checksum');
      throw new UnauthorizedException('Invalid checksum');
    }

    try {
      const payloadStr = Buffer.from(resultB64, 'base64').toString('utf8');
      const payload = JSON.parse(payloadStr);
      const { invoice_no, transaction_id, external_transaction_id, status } = payload;

      console.log(`[IPN] Received: invoice=${invoice_no}, status=${status}`);

      // Idempotency: check if this exact IPN was already processed
      const existing = await query(
        `SELECT id FROM disbursement_audit_log
         WHERE transaction_id = $1 AND event_type = $2`,
        [transaction_id, `ipn_${status.toLowerCase()}`]
      );

      if (existing) {
        console.log(`[IPN] Duplicate ${status} for ${transaction_id}, skipping`);
        return { message: 'Already processed' };
      }

      switch (status) {
        case 'SUCCESS':
          await AnchorRpcService.notifyOffchainFundsAvailable(transaction_id, external_transaction_id);
          await query(
            'UPDATE sep31_transactions SET status = $2, updated_at = now() WHERE id = $1',
            [transaction_id, 'completed']
          );
          await auditLog(transaction_id, 'ipn_success', { external_transaction_id });
          break;

        case 'FAILED': {
          const tx = await query<{ retry_count: number }>(
            'SELECT retry_count FROM sep31_transactions WHERE id = $1',
            [transaction_id]
          );

          const retryCount = tx?.retry_count ?? 0;

          if (retryCount < 3) {
            const nextRetryMs = Math.pow(2, retryCount) * 30_000;
            await query(
              'UPDATE sep31_transactions SET retry_count = retry_count + 1, updated_at = now() WHERE id = $1',
              [transaction_id]
            );
            await auditLog(transaction_id, 'ipn_failed_retry', {
              attempt: retryCount + 1,
              next_retry_ms: nextRetryMs,
            });
            console.warn(`[IPN] FAILED for ${transaction_id}, retry ${retryCount + 1}/3 scheduled in ${nextRetryMs}ms`);
          } else {
            await AnchorRpcService.notifyTransactionError(
              transaction_id,
              `Disbursement failed after 3 retries`
            );
            await query(
              `UPDATE sep31_transactions SET status = 'error', error_message = $2, updated_at = now() WHERE id = $1`,
              [transaction_id, 'Max retries exceeded']
            );
            await auditLog(transaction_id, 'ipn_failed_final', { reason: 'max_retries' });
            console.error(`[ALERT:disbursement_failed] TX ${transaction_id} failed after 3 retries`);
          }
          break;
        }

        default:
          console.warn(`[IPN] Unknown status '${status}' for ${transaction_id}`);
          await auditLog(transaction_id, `ipn_unknown_${status}`, { raw_status: status });
          break;
      }

      return { message: 'Acknowledged' };
    } catch (error: any) {
      console.error('[IPN] Error handling webhook:', error);
      throw new InternalServerErrorException('Internal server error');
    }
  }
}
