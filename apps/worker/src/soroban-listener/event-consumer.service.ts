import { Injectable } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { query, queryAll } from '@uc/core';
import axios from 'axios';
import * as crypto from 'crypto';

@Injectable()
export class EventConsumerService {
  private isProcessing = false;

  @Interval(2000)
  async processQueue() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      const row = await query<{ id: string; ledger: string; tx_hash: string; payload_json: string }>(
        `SELECT id, ledger, tx_hash, payload_json FROM bridge_events_queue 
         WHERE status = 'pending' 
         ORDER BY id ASC LIMIT 1`
      );

      if (!row) {
        this.isProcessing = false;
        return;
      }

      console.log(`[Event Consumer] Processing queued event #${row.id} (Tx: ${row.tx_hash})`);

      const webhookUrl = process.env.SEP31_WEBHOOK_URL || 'http://localhost:3000/api/webhooks/sdp';
      const webhookSecret = process.env.CROSS_BORDER_WEBHOOK_SECRET || 'uctalent-dev-secret';

      const payload = JSON.parse(row.payload_json);
      const payloadString = JSON.stringify(payload);
      const signature = 'sha256=' + crypto.createHmac('sha256', webhookSecret).update(payloadString).digest('hex');

      try {
        const res = await axios.post(webhookUrl, payload, {
          headers: { 
            'Content-Type': 'application/json', 
            'X-UCTALENT-SIGNATURE': signature 
          },
          timeout: 10000,
        });

        console.log(`[Event Consumer] Webhook response ${res.status}:`, JSON.stringify(res.data).substring(0, 150));

        await query(
          "UPDATE bridge_events_queue SET status = 'completed', updated_at = now() WHERE id = $1",
          [row.id]
        );
      } catch (err: any) {
        const status = err.response?.status || 'N/A';
        console.error(`[Event Consumer] Webhook dispatch failed (HTTP ${status}):`, err.message);

        await query(
          `UPDATE bridge_events_queue 
           SET status = 'failed', error_message = $2, retry_count = retry_count + 1, updated_at = now() 
           WHERE id = $1`,
          [row.id, err.message]
        );
      }
    } catch (err: any) {
      console.error('[Event Consumer] Queue processing error:', err.message);
    } finally {
      this.isProcessing = false;
    }
  }
}
