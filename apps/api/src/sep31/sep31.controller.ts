import { 
  Controller, 
  Post, 
  Body, 
  BadRequestException, 
  ConflictException, 
  HttpCode, 
  HttpStatus, 
  InternalServerErrorException, 
  BadGatewayException 
} from '@nestjs/common';
import { Sep31TransactionService } from '@uc/stellar';
import { query, queryAll } from '@uc/core';
import { randomUUID } from 'crypto';

@Controller('sep31')
export class Sep31Controller {
  @Post('initiate')
  @HttpCode(HttpStatus.OK)
  async initiateDisbursement(
    @Body() body: { amount?: string; sender_id?: string; receiver_id?: string; quote_id?: string; idempotency_key?: string }
  ) {
    const { amount, sender_id, receiver_id, quote_id, idempotency_key } = body;

    if (!amount || !sender_id || !receiver_id) {
      throw new BadRequestException('Missing required fields');
    }

    const tempId = randomUUID();

    if (idempotency_key) {
      try {
        await query(
          `INSERT INTO sep31_transactions (id, amount_in, asset_code, sender_id, receiver_id, status, idempotency_key, quote_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [tempId, amount, 'USDC', sender_id, receiver_id, 'processing_lock', idempotency_key, quote_id || null]
        );
      } catch (error: any) {
        if (error.code === '23505') { // Unique constraint violation
          const existingTxList = await queryAll(
            'SELECT id, status FROM sep31_transactions WHERE idempotency_key = $1',
            [idempotency_key]
          );
          if (existingTxList.length > 0) {
            const row = existingTxList[0];
            if (row.status === 'processing_lock') {
              console.log(`[SEP31] Concurrent idempotency hit for key ${idempotency_key} (still processing).`);
              throw new ConflictException('Transaction is currently processing. Please wait.');
            }
            if (row.status === 'error') {
              console.log(`[SEP31] Concurrent idempotency hit for key ${idempotency_key} (failed ambiguously).`);
              throw new ConflictException('Previous attempt failed ambiguously. Please contact support or use a new transaction.');
            }
            console.log(`[SEP31] Concurrent idempotency hit for key ${idempotency_key}. Returning existing tx.`);
            return {
              success: true,
              transactionId: row.id,
              status: row.status,
            };
          }
        }
        throw error;
      }
    } else {
      await query(
        `INSERT INTO sep31_transactions (id, amount_in, asset_code, sender_id, receiver_id, status, quote_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [tempId, amount, 'USDC', sender_id, receiver_id, 'processing_lock', quote_id || null]
      );
    }

    console.log(`[SEP31] Initiating disbursement for ${amount} USDC to receiver ${receiver_id}`);

    let transactionResponse;
    try {
      transactionResponse = await Sep31TransactionService.createTransaction({
        amount,
        asset_code: 'USDC',
        sender_id,
        receiver_id,
        quote_id,
      });
    } catch (apError: any) {
      const msg = apError.message || '';
      const code = apError.code || '';
      const isAmbiguous = msg.includes('timeout') || msg.includes('socket hang up') || code === 'ECONNABORTED' || code === 'ECONNRESET';

      if (isAmbiguous) {
        await query(
          `UPDATE sep31_transactions SET status = 'error', error_message = $1, updated_at = now() WHERE id = $2`,
          ['Ambiguous timeout during AP call', tempId]
        );
        throw new BadGatewayException({
          error: 'ambiguous_timeout',
          message: 'Transaction is in an ambiguous state due to network timeout. Please contact support.'
        });
      } else {
        await query(`DELETE FROM sep31_transactions WHERE id = $1`, [tempId]);

        if (msg.includes('CUSTOMER_NEEDS_INFO')) {
          throw new BadRequestException({ error: 'customer_info_needed' });
        }
        if (msg.includes('QUOTE_EXPIRED')) {
          throw new BadRequestException({ error: 'quote_expired' });
        }
        throw new BadRequestException({ error: 'ap_error', message: msg });
      }
    }

    const transactionId = transactionResponse.id;
    console.log(`[SEP31] Transaction created on AP. ID: ${transactionId}`);

    await query(
      `UPDATE sep31_transactions 
       SET id = $1, status = 'pending_sender', updated_at = now()
       WHERE id = $2`,
      [transactionId, tempId]
    );

    return {
      success: true,
      transactionId,
      status: 'pending_sender',
      stellar_account: transactionResponse.stellar_account,
      stellar_memo: transactionResponse.stellar_memo,
      stellar_memo_type: transactionResponse.stellar_memo_type,
    };
  }
}
