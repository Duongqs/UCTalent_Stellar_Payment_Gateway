import { Injectable } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BridgeEventQueueEntity, EnvService } from '@uc/core';
import axios from 'axios';
import * as crypto from 'crypto';

@Injectable()
export class EventConsumerService {
  private isProcessing = false;

  constructor(
    @InjectRepository(BridgeEventQueueEntity)
    private readonly eventQueueRepo: Repository<BridgeEventQueueEntity>,
    private readonly envService: EnvService,
  ) {}

  @Interval(2000)
  async processQueue() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    let row;
    try {
      row = await this.eventQueueRepo.findOne({
        where: { status: 'pending' },
        order: { id: 'ASC' },
      });

      if (!row) {
        this.isProcessing = false;
        return;
      }

      console.log(
        `[Event Consumer] Processing queued event #${row.id} (Tx: ${row.txHash})`,
      );

      const payload = row.payloadJson;
      const payloadString = JSON.stringify(payload);

      // 1. Dispatch to local AnchorController.disburse
      const localApiPort = this.envService.get('PORT') || 8081;
      const localDisburseUrl = `http://localhost:${localApiPort}/api/anchor/disburse`;
      const localSecret = this.envService.get('WEBHOOK_SECRET') || 'uctalent-dev-secret';
      const localSignature = 'sha256=' + crypto
        .createHmac('sha256', localSecret)
        .update(payloadString)
        .digest('hex');

      try {
        const localRes = await axios.post(localDisburseUrl, payload, {
          headers: {
            'Content-Type': 'application/json',
            'X-UCTALENT-SIGNATURE': localSignature,
          },
          timeout: 10000,
        });
        console.log(`[Event Consumer] Local disburse response: ${localRes.status}`);
      } catch (err: any) {
        console.error(`[Event Consumer] Local disburse failed: ${err.message}`);
        throw err;
      }

      // 2. Dispatch to backend webhook (uctalent-backend)
      const backendWebhookUrl = this.envService.get('UCTALENT_BACKEND_WEBHOOK_URL');
      let targetBackendUrl = backendWebhookUrl;
      if (targetBackendUrl) {
        if (targetBackendUrl.includes('settlement-callback')) {
          targetBackendUrl = targetBackendUrl.replace('settlement-callback', 'webhook');
        }
        if (!targetBackendUrl.includes('/v2/')) {
          targetBackendUrl = targetBackendUrl.replace('/api/', '/api/v2/');
        }
      } else {
        targetBackendUrl = 'http://localhost:4000/api/v2/cross-border/webhook';
      }

      const backendSecret = this.envService.get('CROSS_BORDER_WEBHOOK_SECRET') || 'uctalent-dev-secret';
      const backendSig = crypto
        .createHmac('sha256', backendSecret)
        .update(payloadString)
        .digest('hex');
      const backendSignature = `sha256=${backendSig}`;

      try {
        const backendRes = await axios.post(targetBackendUrl, payload, {
          headers: {
            'Content-Type': 'application/json',
            'X-UCTALENT-SIGNATURE': backendSignature,
          },
          timeout: 10000,
        });
        console.log(`[Event Consumer] Backend webhook response: ${backendRes.status}`);
      } catch (err: any) {
        console.error(`[Event Consumer] Backend webhook failed: ${err.message}`);
        throw err;
      }

      // Mark event as completed
      await this.eventQueueRepo.update(row.id, {
        status: 'completed',
      });
    } catch (err: any) {
      const status = err.response?.status || 'N/A';
      console.error(
        `[Event Consumer] Webhook dispatch failed (HTTP ${status}):`,
        err.message,
      );

      if (row) {
        await this.eventQueueRepo.update(row.id, {
          status: 'failed',
          errorMessage: err.message,
          retryCount: (row.retryCount || 0) + 1,
        });
      }
    } finally {
      this.isProcessing = false;
    }
  }
}
