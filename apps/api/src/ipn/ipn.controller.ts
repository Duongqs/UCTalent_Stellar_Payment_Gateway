import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  InternalServerErrorException,
} from '@nestjs/common';
import { AnchorRpcService } from '@uc/stellar';
import { Sep31CoreService, EnvService } from '@uc/core';
import { IpnDto } from './dtos/ipn.dto';
import * as crypto from 'crypto';
import axios from 'axios';

@Controller('ipn')
export class IpnController {
  constructor(
    private readonly sep31CoreService: Sep31CoreService,
    private readonly anchorRpc: AnchorRpcService,
    private readonly envService: EnvService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async handleIpn(@Body() body: IpnDto) {
    const resultB64 = body.result;
    const receivedChecksum = body.checksum;

    const expectedChecksum = crypto
      .createHash('sha256')
      .update(resultB64 + (this.envService.get('NINEPAY_CHECKSUM_KEY') || ''))
      .digest('hex')
      .toUpperCase();

    if (receivedChecksum !== expectedChecksum) {
      console.error('[IPN] Invalid checksum');
      throw new UnauthorizedException('Invalid checksum');
    }

    try {
      const payloadStr = Buffer.from(resultB64, 'base64').toString('utf8');
      const payload = JSON.parse(payloadStr);
      const { invoice_no, transaction_id, external_transaction_id, status } =
        payload;

      console.log(`[IPN] Received: invoice=${invoice_no}, status=${status}`);

      const eventType = `ipn_${status.toLowerCase()}`;
      const existing = await this.sep31CoreService.hasEventLogged(
        transaction_id,
        eventType,
      );

      if (existing) {
        console.log(
          `[IPN] Duplicate ${status} for ${transaction_id}, skipping`,
        );
        return { message: 'Already processed' };
      }

      switch (status) {
        case 'SUCCESS':
          // Notify Platform first (only if not an off-platform transaction)
          if (!transaction_id.startsWith('ucttx')) {
            await this.anchorRpc.notifyOffchainFundsAvailable(
              transaction_id,
              external_transaction_id,
            );
          }

          // Atomic DB transaction
          await this.sep31CoreService.completeDisbursement(
            transaction_id,
            external_transaction_id,
          );

          // Notify backend
          const backendWebhookUrl = this.envService.get('UCTALENT_BACKEND_WEBHOOK_URL');
          const isTest = this.envService.get('NODE_ENV') === 'test';
          if (backendWebhookUrl && !isTest) {
            const callbackPayload = {
              anchorTxId: transaction_id,
              invoiceNo: transaction_id,
              status: 'success',
              externalTxId: external_transaction_id,
            };
            const callbackPayloadString = JSON.stringify(callbackPayload);
            const secret = this.envService.get('CROSS_BORDER_WEBHOOK_SECRET') || 'uctalent-dev-secret';
            const signature = crypto
              .createHmac('sha256', secret)
              .update(callbackPayloadString)
              .digest('hex');

            try {
              await axios.post(backendWebhookUrl, callbackPayload, {
                headers: {
                  'Content-Type': 'application/json',
                  'X-UCTALENT-SIGNATURE': `sha256=${signature}`,
                },
                timeout: 5000,
              });
            } catch (err: any) {
              console.error(`[IPN] Failed to send settlement callback to backend: ${err.message}`);
            }
          }
          break;

        case 'FAILED': {
          const tx = await this.sep31CoreService.findById(transaction_id);
          const retryCount = tx?.retryCount ?? 0;

          if (retryCount < 3) {
            const nextRetryMs = Math.pow(2, retryCount) * 30_000;
            await this.sep31CoreService.retryDisbursement(
              transaction_id,
              retryCount,
              nextRetryMs,
            );
            console.warn(
              `[IPN] FAILED for ${transaction_id}, retry ${retryCount + 1}/3 scheduled in ${nextRetryMs}ms`,
            );
          } else {
            if (!transaction_id.startsWith('ucttx')) {
              await this.anchorRpc.notifyTransactionError(
                transaction_id,
                `Disbursement failed after 3 retries`,
              );
            }
            await this.sep31CoreService.failDisbursement(transaction_id);
            console.error(
              `[ALERT:disbursement_failed] TX ${transaction_id} failed after 3 retries`,
            );

            // Notify backend
            const backendWebhookUrl = this.envService.get('UCTALENT_BACKEND_WEBHOOK_URL');
            const isTest = this.envService.get('NODE_ENV') === 'test';
            if (backendWebhookUrl && !isTest) {
              const callbackPayload = {
                anchorTxId: transaction_id,
                invoiceNo: transaction_id,
                status: 'failed',
              };
              const callbackPayloadString = JSON.stringify(callbackPayload);
              const secret = this.envService.get('CROSS_BORDER_WEBHOOK_SECRET') || 'uctalent-dev-secret';
              const signature = crypto
                .createHmac('sha256', secret)
                .update(callbackPayloadString)
                .digest('hex');

              try {
                await axios.post(backendWebhookUrl, callbackPayload, {
                  headers: {
                    'Content-Type': 'application/json',
                    'X-UCTALENT-SIGNATURE': `sha256=${signature}`,
                  },
                  timeout: 5000,
                });
              } catch (err: any) {
                console.error(`[IPN] Failed to send failed settlement callback to backend: ${err.message}`);
              }
            }
          }
          break;
        }

        default:
          console.warn(
            `[IPN] Unknown status '${status}' for ${transaction_id}`,
          );
          break;
      }

      return { message: 'Acknowledged' };
    } catch (error: any) {
      console.error('[IPN] Error handling webhook:', error);
      throw new InternalServerErrorException('Internal server error');
    }
  }
}
