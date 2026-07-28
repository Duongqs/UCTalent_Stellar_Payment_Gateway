import {
  Controller,
  Post,
  Body,
  Req,
  HttpException,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  InternalServerErrorException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AnchorRpcService } from '@uc/stellar';
import { Sep31CoreService, EnvService } from '@uc/core';
import { NinePayGatewayService } from '@uc/banking';
import { IpnDto } from './dtos/ipn.dto';
import * as crypto from 'crypto';
import axios from 'axios';

@Controller('ipn')
export class IpnController {
  private readonly requestCounts = new Map<string, number[]>();

  constructor(
    private readonly sep31CoreService: Sep31CoreService,
    private readonly anchorRpc: AnchorRpcService,
    private readonly envService: EnvService,
    private readonly ninePayGatewayService: NinePayGatewayService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async handleIpn(@Req() request: any, @Body() body: IpnDto) {
    const clientIp =
      request?.headers?.['x-forwarded-for'] ||
      request?.socket?.remoteAddress ||
      'unknown';
    const now = Date.now();
    const requests = this.requestCounts.get(clientIp as string) || [];
    const recent = requests.filter((time) => now - time < 60000);
    if (recent.length > 20) {
      throw new HttpException(
        'Too Many Requests',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    recent.push(now);
    this.requestCounts.set(clientIp as string, recent);

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
      // In 9Pay real IPN: invoice_no is our request_id, transaction_id is 9Pay's payment_no
      const { invoice_no, transaction_id, external_transaction_id, status } = payload;

      const realPaymentNo = external_transaction_id || transaction_id;
      const merchantInvoiceNo = invoice_no || transaction_id; // fallback for mock which might send invoice in transaction_id

      console.log(`[IPN] Received: invoice=${merchantInvoiceNo}, payment_no=${realPaymentNo}, status=${status}`);

      // Ignore PIT invoices as they are internal tax disbursements and not tracked in SEP-31 DB
      if (String(merchantInvoiceNo).endsWith('PIT')) {
         console.log(`[IPN] Acknowledging PIT internal disbursement: ${merchantInvoiceNo}`);
         return { message: 'Acknowledged' };
      }

      // Map back truncated ID (30 chars) to full UUID
      const tx = await this.sep31CoreService.findByPartialId(merchantInvoiceNo);
      if (!tx) {
         console.warn(`[IPN] Cannot find matching transaction for partial ID ${merchantInvoiceNo}`);
         return { message: 'Not found' };
      }
      const realTxId = tx.id;

      const eventType = `ipn_${status.toLowerCase()}`;
      const existing = await this.sep31CoreService.hasEventLogged(
        realTxId,
        eventType,
      );

      if (existing) {
        console.log(
          `[IPN] Duplicate ${status} for ${realTxId}, skipping`,
        );
        return { message: 'Already processed' };
      }

      switch (status) {
        case 'SUCCESS':
          // Notify Platform first (only if not an off-platform transaction)
          if (!realTxId.startsWith('ucttx')) {
            try {
              await this.anchorRpc.notifyOffchainFundsAvailable(
                realTxId,
                realPaymentNo,
              );
            } catch (err: any) {
              console.warn(`[IPN] Failed to notify Anchor Platform (may be mocked/down):`, err.message);
            }
          }

          // Atomic DB transaction
          await this.sep31CoreService.completeDisbursement(
            realTxId,
            realPaymentNo,
          );

          await this.sendBackendWebhook(realTxId, 'success', {
            externalTxId: realPaymentNo,
            ninePayInvoiceNo: merchantInvoiceNo,
          });
          break;

        case 'FAILED': {
          const retryCount = tx?.retryCount ?? 0;

          if (retryCount < 3) {
            const nextRetryMs = Math.pow(2, retryCount) * 30_000;
            await this.sep31CoreService.retryDisbursement(
              realTxId,
              retryCount,
              nextRetryMs,
            );
            console.warn(
              `[IPN] FAILED for ${realTxId}, retry ${retryCount + 1}/3 scheduled in ${nextRetryMs}ms`,
            );
          } else {
            if (!realTxId.startsWith('ucttx')) {
              try {
                await this.anchorRpc.notifyTransactionError(
                  realTxId,
                  `Disbursement failed after 3 retries`,
                );
              } catch (err: any) {
                console.warn(`[IPN] Failed to notify Anchor Platform error (may be mocked/down):`, err.message);
              }
            }
            await this.sep31CoreService.failDisbursement(realTxId);
            console.error(
              `[ALERT:disbursement_failed] TX ${realTxId} failed after 3 retries`,
            );

            await this.sendBackendWebhook(realTxId, 'failed');
          }
          break;
        }

        default:
          console.warn(
            `[IPN] Unknown status '${status}' for ${realTxId}`,
          );
          break;
      }

      return { message: 'Acknowledged' };
    } catch (error: any) {
      console.error('[IPN] Error handling webhook:', error);
      throw new InternalServerErrorException('Internal server error');
    }
  }

  private async sendBackendWebhook(
    transactionId: string,
    status: 'success' | 'failed',
    extraFields?: Record<string, unknown>,
  ) {
    const backendWebhookUrl = this.envService.get(
      'UCTALENT_BACKEND_WEBHOOK_URL',
    );
    const isTest = this.envService.get('NODE_ENV') === 'test';

    if (!backendWebhookUrl || isTest) {
      return;
    }

    const txRecord = await this.sep31CoreService.findById(transactionId);
    const distributionId = txRecord?.distributionId;

    if (!distributionId) {
      console.warn(
        `[IPN] Skipping backend ${status} webhook for ${transactionId}: distributionId is missing`,
      );
      return;
    }

    const callbackPayload: Record<string, unknown> = {
      distributionId,
      anchorTxId: transactionId,
      invoiceNo: transactionId,
      status,
      ...extraFields,
    };

    if (status === 'success' && txRecord) {
      callbackPayload.vndAmount = txRecord.vndAmount
        ? Number(txRecord.vndAmount)
        : undefined;
      callbackPayload.taxWithheld = txRecord.withheldTaxAmount
        ? Number(txRecord.withheldTaxAmount)
        : undefined;
      let realNapasRefId = txRecord.napasRefId;
      if (!realNapasRefId || realNapasRefId.startsWith('9PAY-FALLBACK')) {
        realNapasRefId = (extraFields?.externalTxId as string) || (extraFields?.ninePayInvoiceNo as string) || txRecord.napasRefId;
      }
      callbackPayload.napasRefId = realNapasRefId;
      callbackPayload.stellarTxHash = txRecord.stellarTxHash;
      callbackPayload.clearingId = transactionId;
      callbackPayload.exchangeRate = txRecord.exchangeRate
        ? Number(txRecord.exchangeRate)
        : undefined;
    }

    const callbackPayloadString = JSON.stringify(callbackPayload);
    const secret =
      this.envService.get('CROSS_BORDER_WEBHOOK_SECRET') ||
      'uctalent-dev-secret';
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
      console.error(
        `[IPN] Failed to send ${status} settlement callback to backend: ${err.message}`,
      );
    }
  }

  @Cron(CronExpression.EVERY_30_SECONDS)
  async pollPendingExternal() {
    try {
      console.log(
        '[IPN Cron] Polling 9Pay for pending_external transactions...',
      );
      const pendingTransactions =
        await this.sep31CoreService.findPendingExternal();
      for (const tx of pendingTransactions) {
        console.log(
          `[IPN Cron] Checking status for transaction: ${tx.id} (invoice: ${tx.id})`,
        );
        const result = await this.ninePayGatewayService.checkStatus(tx.id);

        if (result && result.status !== undefined) {
          // Status 5 is typically SUCCESS in 9Pay
          if (result.status === 5) {
            console.log(
              `[IPN Cron] Transaction ${tx.id} is SUCCESS in 9Pay. Simulating IPN handling.`,
            );
            await this.handleIpn({ headers: {}, socket: {} }, {
              result: Buffer.from(
                JSON.stringify({
                  invoice_no: tx.id,
                  transaction_id: tx.id,
                  external_transaction_id:
                    result.transaction_id || `simulated-${Date.now()}`,
                  status: 'SUCCESS',
                }),
              ).toString('base64'),
              checksum: crypto
                .createHash('sha256')
                .update(
                  Buffer.from(
                    JSON.stringify({
                      invoice_no: tx.id,
                      transaction_id: tx.id,
                      external_transaction_id:
                        result.transaction_id || `simulated-${Date.now()}`,
                      status: 'SUCCESS',
                    }),
                  ).toString('base64') +
                    (this.envService.get('NINEPAY_CHECKSUM_KEY') || ''),
                )
                .digest('hex')
                .toUpperCase(),
            } as any);
          } else if (result.status === 3 || result.status === 6) {
            // Status 3/6 are typically FAILED
            console.log(
              `[IPN Cron] Transaction ${tx.id} FAILED in 9Pay (status: ${result.status}). Simulating IPN failure.`,
            );
            await this.handleIpn({ headers: {}, socket: {} }, {
              result: Buffer.from(
                JSON.stringify({
                  invoice_no: tx.id,
                  transaction_id: tx.id,
                  external_transaction_id: result.transaction_id || '',
                  status: 'FAILED',
                }),
              ).toString('base64'),
              checksum: crypto
                .createHash('sha256')
                .update(
                  Buffer.from(
                    JSON.stringify({
                      invoice_no: tx.id,
                      transaction_id: tx.id,
                      external_transaction_id: result.transaction_id || '',
                      status: 'FAILED',
                    }),
                  ).toString('base64') +
                    (this.envService.get('NINEPAY_CHECKSUM_KEY') || ''),
                )
                .digest('hex')
                .toUpperCase(),
            } as any);
          } else {
            console.log(
              `[IPN Cron] Transaction ${tx.id} is still pending (status: ${result.status}).`,
            );
          }
        }
      }
    } catch (error: any) {
      console.error(
        '[IPN Cron] Error polling pending_external:',
        error.message,
      );
    }
  }
}
