import { Request, Response } from 'express';
import { Sep31TransactionService } from '../services/sep31-transaction.service';
import { AnchorRpcService } from '../services/anchor-rpc.service';

export class Sep31Controller {
  static async initiateDisbursement(req: Request, res: Response) {
    try {
      const { amount, sender_id, receiver_id, quote_id, idempotency_key } = req.body;
      
      if (!amount || !sender_id || !receiver_id) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const db = require('../db');

      const tempId = require('crypto').randomUUID();
      
      if (idempotency_key) {
        try {
          // Atomic lock: Reserve idempotency key before calling Anchor Platform
          await db.query(
            `INSERT INTO sep31_transactions (id, amount_in, asset_code, sender_id, receiver_id, status, idempotency_key, quote_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [tempId, amount, 'USDC', sender_id, receiver_id, 'processing_lock', idempotency_key, quote_id || null]
          );
        } catch (error: any) {
          if (error.code === '23505') { // Unique constraint violation
            const existingTx = await db.query(
              'SELECT id, status FROM sep31_transactions WHERE idempotency_key = $1',
              [idempotency_key]
            );
            if (existingTx.rows.length > 0) {
              const row = existingTx.rows[0];
              if (row.status === 'processing_lock') {
                console.log(`[SEP31] Concurrent idempotency hit for key ${idempotency_key} (still processing).`);
                return res.status(409).json({ error: 'Transaction is currently processing. Please wait.' });
              }
              if (row.status === 'error') {
                console.log(`[SEP31] Concurrent idempotency hit for key ${idempotency_key} (failed ambiguously).`);
                return res.status(409).json({ error: 'Previous attempt failed ambiguously. Please contact support or use a new transaction.' });
              }
              console.log(`[SEP31] Concurrent idempotency hit for key ${idempotency_key}. Returning existing tx.`);
              return res.status(200).json({
                success: true,
                transactionId: row.id,
              });
            }
          }
          throw error;
        }
      } else {
        // No idempotency key, just insert a pending lock row
        await db.query(
            `INSERT INTO sep31_transactions (id, amount_in, asset_code, sender_id, receiver_id, status, quote_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [tempId, amount, 'USDC', sender_id, receiver_id, 'processing_lock', quote_id || null]
        );
      }

      console.log(`[SEP31] Initiating disbursement for ${amount} USDC to receiver ${receiver_id}`);
      
      let transactionResponse;
      try {
        // 1. Create Transaction on Anchor Platform
        transactionResponse = await Sep31TransactionService.createTransaction({
          amount,
          asset_code: 'USDC',
          sender_id,
          receiver_id,
          quote_id
        });
      } catch (apError: any) {
        const msg = apError.message || '';
        const code = apError.code || '';
        const isAmbiguous = msg.includes('timeout') || msg.includes('socket hang up') || code === 'ECONNABORTED' || code === 'ECONNRESET';

        if (isAmbiguous) {
          await db.query(`UPDATE sep31_transactions SET status = 'error', error_message = $1, updated_at = now() WHERE id = $2`, ['Ambiguous timeout during AP call', tempId]);
          return res.status(502).json({ error: 'ambiguous_timeout', message: 'Transaction is in an ambiguous state due to network timeout. Please contact support.' });
        } else {
          await db.query(`DELETE FROM sep31_transactions WHERE id = $1`, [tempId]);
          
          if (msg.includes('CUSTOMER_NEEDS_INFO')) {
            return res.status(400).json({ error: 'customer_info_needed' });
          }
          if (msg.includes('QUOTE_EXPIRED')) {
            return res.status(400).json({ error: 'quote_expired' });
          }
          return res.status(400).json({ error: 'ap_error', message: msg });
        }
      }

      const transactionId = transactionResponse.id;
      console.log(`[SEP31] Transaction created on AP. ID: ${transactionId}`);

      // 2. Update the processing_lock row with the real Anchor Platform ID
      await db.query(
        `UPDATE sep31_transactions 
         SET id = $1, status = 'pending_sender', updated_at = now()
         WHERE id = $2`,
        [transactionId, tempId]
      );

      // 2. We don't need to call requestOnchainFunds because SEP-31 transactions
      // are created in pending_sender state by default.

      return res.status(200).json({ 
        success: true, 
        transactionId,
        stellar_account: transactionResponse.stellar_account,
        stellar_memo: transactionResponse.stellar_memo,
        stellar_memo_type: transactionResponse.stellar_memo_type
      });
      
    } catch (error: any) {
      const errorMessage = error?.message || String(error);
      console.error('[SEP31] Failed to initiate disbursement:', errorMessage);
      return res.status(500).json({ error: 'Failed to initiate disbursement', message: errorMessage });
    }
  }
}
