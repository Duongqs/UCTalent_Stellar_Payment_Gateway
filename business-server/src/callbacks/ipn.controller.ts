import { Request, Response } from 'express';
import crypto from 'crypto';
import { AnchorRpcService } from '../services/anchor-rpc.service';
import { query, auditLog } from '../db';

export class IpnController {
  // POST /ipn — 9Pay calls back when NAPAS transaction completes/fails
  static async handleIpn(req: Request, res: Response): Promise<void> {
    try {
      // Verify 9Pay checksum before processing
      const resultB64 = req.body.result;
      const receivedChecksum = req.body.checksum;
      
      // Allow bypassing checksum ONLY if both are missing (e.g., from old tests) AND we are not in strict mode, 
      // but here we enforce it since the tests are failing due to it.
      if (!resultB64 || !receivedChecksum) {
        console.error('[IPN] Missing result or checksum');
        res.status(401).json({ error: 'Invalid checksum' });
        return;
      }

      const expectedChecksum = crypto
        .createHash('sha256')
        .update(resultB64 + (process.env.NINEPAY_CHECKSUM_KEY || ''))
        .digest('hex')
        .toUpperCase();

      if (receivedChecksum !== expectedChecksum) {
        console.error('[IPN] Invalid checksum');
        res.status(401).json({ error: 'Invalid checksum' });
        return;
      }

      const payloadStr = Buffer.from(resultB64, 'base64').toString('utf8');
      const payload = JSON.parse(payloadStr);
      const { invoice_no, transaction_id, external_transaction_id, status } = payload;

      console.log(`[IPN] Received: invoice=${invoice_no}, status=${status}`);

      // ── Idempotency: skip if this exact IPN was already processed ──
      const existing = await query(
        `SELECT id FROM disbursement_audit_log
         WHERE transaction_id = $1 AND event_type = $2`,
        [transaction_id, `ipn_${status.toLowerCase()}`]
      );

      if (existing) {
        console.log(`[IPN] Duplicate ${status} for ${transaction_id}, skipping`);
        res.status(200).json({ message: 'Already processed' });
        return;
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
            // Re-queue for retry — in production, use BullMQ/Redis sorted set
            const nextRetryMs = Math.pow(2, retryCount) * 30_000; // 30s, 60s, 120s
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
            // Max retries exceeded → Dead Letter Queue
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

      res.status(200).json({ message: 'Acknowledged' });
      return;
    } catch (error) {
      console.error('[IPN] Error handling webhook:', error);
      res.status(500).json({ error: 'Internal server error' });
      return;
    }
  }
}
