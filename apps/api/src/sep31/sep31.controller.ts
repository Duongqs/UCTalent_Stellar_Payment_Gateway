import {
  Controller,
  Post,
  Get,
  Body,
  BadRequestException,
  ConflictException,
  HttpCode,
  HttpStatus,
  InternalServerErrorException,
  BadGatewayException,
  UseGuards,
} from '@nestjs/common';
import { Sep31TransactionService } from '@uc/stellar';
import { Sep31CoreService, FirmQuoteService } from '@uc/core';
import { BankVaultService } from '@uc/banking';
import { InitiateDisbursementDto } from './dtos/initiate-disbursement.dto';
import { AnchorWebhookGuard } from './guards/anchor-webhook.guard';
import { randomUUID } from 'crypto';

@Controller('sep31')
export class Sep31Controller {
  constructor(
    private readonly sep31CoreService: Sep31CoreService,
    private readonly sep31Service: Sep31TransactionService,
    private readonly firmQuoteService: FirmQuoteService,
    private readonly bankVaultService: BankVaultService,
  ) {}

  @Get('info')
  @HttpCode(HttpStatus.OK)
  async getInfo() {
    return {
      receive: {
        USDC: {
          enabled: true,
          fee_fixed: 0,
          fee_percent: 0,
          min_amount: 1,
          max_amount: 1000000,
          quotes_supported: true,
          quotes_required: true,
        },
      },
    };
  }

  @Post('initiate')
  @UseGuards(AnchorWebhookGuard)
  @HttpCode(HttpStatus.OK)
  async initiateDisbursement(@Body() body: InitiateDisbursementDto) {
    const { amount, sender_id, receiver_id, quote_id, idempotency_key } = body;

    if (quote_id) {
      const quote = await this.firmQuoteService.findById(quote_id);
      if (!quote) {
        throw new BadRequestException({ error: 'quote_not_found', message: 'Quote not found' });
      }
      if (quote.expiresAt && new Date(quote.expiresAt) < new Date()) {
        throw new BadRequestException({ error: 'quote_expired', message: 'Quote expired' });
      }
      if (quote.usedAt) {
        throw new ConflictException({ error: 'quote_already_used', message: 'Quote already used' });
      }
    }

    const tempId = randomUUID();

    try {
      const tx = this.sep31CoreService.create({
        id: tempId,
        amountIn: amount,
        assetCode: 'USDC',
        senderId: sender_id,
        receiverId: receiver_id,
        status: 'processing_lock',
        idempotencyKey: idempotency_key || undefined,
        distributionId: idempotency_key || undefined,
        quoteId: quote_id || undefined,
      });
      await this.sep31CoreService.insert(tx);
    } catch (error: any) {
      const isUniqueConstraint =
        error.code === '23505' ||
        (error.message && error.message.includes('UNIQUE constraint failed'));
      if (isUniqueConstraint && idempotency_key) {
        const row =
          await this.sep31CoreService.findByIdempotencyKey(idempotency_key);
        if (row) {
          if (row.status === 'processing_lock') {
            console.log(
              `[SEP31] Concurrent idempotency hit for key ${idempotency_key} (still processing).`,
            );
            throw new ConflictException(
              'Transaction is currently processing. Please wait.',
            );
          }
          if (row.status === 'error') {
            console.log(
              `[SEP31] Concurrent idempotency hit for key ${idempotency_key} (failed ambiguously).`,
            );
            throw new ConflictException(
              'Previous attempt failed ambiguously. Please contact support or use a new transaction.',
            );
          }
          console.log(
            `[SEP31] Concurrent idempotency hit for key ${idempotency_key}. Returning existing tx.`,
          );
          return {
            success: true,
            transactionId: row.id,
            status: row.status,
          };
        }
      }
      throw error;
    }

    console.log(
      `[SEP31] Initiating disbursement for ${amount} USDC to receiver ${receiver_id}`,
    );

    let receiver_routing_number = 'mock';
    let receiver_account_number = 'mock';
    try {
      const profile = await this.bankVaultService.getProfile(receiver_id);
      if (profile && profile.isVerified) {
        const fullProfile = await this.bankVaultService.hydrateBankInfo(profile.beneficiaryRefId);
        receiver_routing_number = fullProfile.bank_code;
        receiver_account_number = fullProfile.account_number;
      }
    } catch (e) {
      console.warn(`[SEP31] Could not fetch real bank profile for ${receiver_id}, using mock`);
    }

    let transactionResponse;
    try {
      transactionResponse = await this.sep31Service.createTransaction({
        amount,
        asset_code: 'USDC',
        sender_id,
        receiver_id,
        receiver_routing_number,
        receiver_account_number,
      });
    } catch (apError: any) {
      const msg = apError.message || '';
      const code = apError.code || '';
      const isAmbiguous =
        msg.includes('timeout') ||
        msg.includes('socket hang up') ||
        code === 'ECONNABORTED' ||
        code === 'ECONNRESET';

      if (isAmbiguous) {
        await this.sep31CoreService.update(tempId, {
          status: 'error',
          errorMessage: 'Ambiguous timeout during AP call',
        });
        throw new BadGatewayException({
          error: 'ambiguous_timeout',
          message:
            'Transaction is in an ambiguous state due to network timeout. Please contact support.',
        });
      } else {
        await this.sep31CoreService.delete(tempId);

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

    await this.sep31CoreService.updateWithQueryBuilder(tempId, {
      id: transactionId,
      status: 'pending_sender',
    });

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
