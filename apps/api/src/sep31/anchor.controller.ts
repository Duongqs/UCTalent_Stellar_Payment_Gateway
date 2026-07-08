import {
  Controller,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Sep31CoreService, CustomerService } from '@uc/core';
import { AnchorWebhookGuard } from './guards/anchor-webhook.guard';
import { DisburseDto } from './dtos/disburse.dto';
import { randomUUID } from 'crypto';

@Controller('anchor')
export class AnchorController {
  private readonly logger = new Logger(AnchorController.name);

  constructor(
    private readonly sep31CoreService: Sep31CoreService,
    private readonly customerService: CustomerService,
  ) {}

  @Post('disburse')
  @UseGuards(AnchorWebhookGuard)
  @HttpCode(HttpStatus.OK)
  async disburse(@Body() payload: DisburseDto) {
    const { stellarTxHash, stellarMemo, splits } = payload;
    const effectiveRate = payload.oracleRate || 25000;

    this.logger.log(
      `Received disbursement request for Tx: ${stellarTxHash}, Memo: ${stellarMemo}`,
    );

    // Verify on-chain transaction status if possible
    if (
      stellarTxHash &&
      stellarTxHash !== '0xmock' &&
      !stellarTxHash.startsWith('0xmock')
    ) {
      this.logger.log(
        `Skipping on-chain Soroban TX check for: ${stellarTxHash}`,
      );
    }

    // Idempotency check: see if we already processed this Stellar Tx Hash
    const existingTxs =
      await this.sep31CoreService.findByStellarTxHash(stellarTxHash);
    if (existingTxs.length > 0) {
      this.logger.log(
        `Idempotent recovery: Stellar Tx ${stellarTxHash} already processed.`,
      );
      return {
        status: 'processing',
        message: 'SEP-31 anchor pipeline initiated (idempotent recovery)',
        timestamp: new Date().toISOString(),
        disbursements: existingTxs.map((tx) => ({
          id: tx.id,
          party: tx.taxCode || 'talent',
          amountVnd: tx.vndAmount || 0,
          clearingId: tx.napasRefId || '',
          status: tx.status,
        })),
      };
    }

    const disbursementResults: any[] = [];
    const splitsToProcess = Object.entries(splits || {}).filter(
      ([_, split]: [string, any]) => split.amountUsdc > 0,
    );

    for (const [party, split] of splitsToProcess as [string, any][]) {
      const amountUsdc = split.amountUsdc;
      const amountVnd = Math.round(amountUsdc * effectiveRate);
      const clearingId = `9payclr${randomUUID().replace(/-/g, '').substring(0, 12).toUpperCase()}`;
      const txId = `ucttx${randomUUID().replace(/-/g, '').substring(0, 10)}`;

      let resolvedKycId = split.kycId;
      if ((!resolvedKycId || resolvedKycId === 'SYSTEM') && payload.recipient) {
        const customer = await this.customerService.findByAccount(payload.recipient);
        if (customer) {
          resolvedKycId = customer.id;
        }
      }

      // Save a Sep31TransactionEntity record to the DB
      const tx = this.sep31CoreService.create({
        id: txId,
        amountIn: amountUsdc.toString(),
        assetCode: 'USDC',
        senderId: 'GLOBAL_PLATFORM_SENDER_ID',
        receiverId: resolvedKycId || 'SYSTEM',
        status: party === 'platform' ? 'usdc_retained' : 'pending_clearing',
        stellarTxHash,
        stellarMemo,
        napasRefId: clearingId,
        vndAmount: party === 'platform' ? 0 : amountVnd,
        taxCode: party, // Temporarily store the party type in the taxCode column for mapping
      });

      await this.sep31CoreService.save(tx);

      disbursementResults.push({
        id: txId,
        party,
        amountVnd: party === 'platform' ? 0 : amountVnd,
        clearingId,
        status: tx.status,
      });

      this.logger.log(
        `Created split transaction record: ID: ${txId}, Party: ${party}, Amount: ${amountUsdc} USDC`,
      );
    }

    return {
      status: 'processing',
      message: 'SEP-31 anchor pipeline initiated',
      timestamp: new Date().toISOString(),
      disbursements: disbursementResults,
    };
  }
}
