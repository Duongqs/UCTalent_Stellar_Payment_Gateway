import {
  Controller,
  Post,
  Get,
  Body,
  Patch,
  Put,
  Param,
  BadRequestException,
  ConflictException,
  HttpCode,
  HttpStatus,
  InternalServerErrorException,
  BadGatewayException,
  UseGuards,
} from '@nestjs/common';
import { Sep31TransactionService } from '@uc/stellar';
import { Sep31CoreService, FirmQuoteService, EnvService } from '@uc/core';
import { BankVaultService } from '@uc/banking';
import { InitiateDisbursementDto } from './dtos/initiate-disbursement.dto';
import { PostTransactionDto } from './dtos/post-transaction.dto';
import { AnchorWebhookGuard } from './guards/anchor-webhook.guard';
import { Sep10Guard } from '../auth/guards/sep10.guard';
import { randomUUID } from 'crypto';

@Controller('sep31')
export class Sep31Controller {
  constructor(
    private readonly sep31CoreService: Sep31CoreService,
    private readonly sep31Service: Sep31TransactionService,
    private readonly firmQuoteService: FirmQuoteService,
    private readonly bankVaultService: BankVaultService,
    private readonly envService: EnvService,
  ) {}

  @Get('info')
  @HttpCode(HttpStatus.OK)
  async getInfo() {
    return {
      receive: {
        USDC: {
          funding_methods: ['NAPAS'],
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
    const { amount, sender_id, receiver_id, quote_id, idempotency_key, distribution_id } = body;

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
        distributionId: distribution_id || (idempotency_key ? idempotency_key.substring(0, idempotency_key.lastIndexOf('-')) : undefined) || undefined,
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
        quote_id,
        receiver_routing_number,
        receiver_account_number,
      });
    } catch (apError: any) {
      const msg = apError.message || apError.code || '';
      const code = apError.code || '';
      const isAmbiguous =
        msg.includes('timeout') ||
        msg.includes('socket hang up') ||
        code === 'ECONNABORTED' ||
        code === 'ECONNRESET';
      const isConnectionRefused =
        msg.includes('ECONNREFUSED') ||
        code === 'ECONNREFUSED' ||
        msg.includes('Service unreachable');

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
      } else if (isConnectionRefused) {
        await this.sep31CoreService.delete(tempId);
        throw new BadGatewayException({
          error: 'ap_service_unavailable',
          message: 'Anchor Platform service is currently unreachable.',
        });
      } else {
        await this.sep31CoreService.delete(tempId);

        if (msg.includes('CUSTOMER_NEEDS_INFO')) {
          throw new BadRequestException({ error: 'customer_info_needed' });
        }
        if (msg.includes('QUOTE_EXPIRED')) {
          throw new BadRequestException({ error: 'quote_expired' });
        }
        throw new BadRequestException({ error: 'ap_error', message: msg || 'Anchor Platform error' });
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

  @Post('transactions')
  @UseGuards(Sep10Guard)
  @HttpCode(HttpStatus.CREATED)
  async createTransaction(@Body() body: PostTransactionDto) {
    const { amount, asset_code, funding_method, sender_id, receiver_id, quote_id, asset_issuer, destination_asset, refund_memo, refund_memo_type } = body;
    
    if (asset_code !== 'USDC') {
      throw new BadRequestException({ error: 'asset_not_supported', message: 'Only USDC is supported' });
    }
    
    if (asset_issuer) {
      const expectedIssuer = this.envService.get('USDC_ISSUER');
      if (asset_issuer !== expectedIssuer) {
        throw new BadRequestException({ error: 'invalid_asset_issuer', message: 'Unsupported asset issuer' });
      }
    }

    if (destination_asset) {
      if (destination_asset !== 'iso4217:VND') {
        throw new BadRequestException({
          error: 'unsupported_destination_asset',
          message: 'Only iso4217:VND is supported as destination_asset',
        });
      }
    }
    
    if (funding_method !== 'NAPAS') {
      throw new BadRequestException({ error: 'invalid_funding_method', message: 'Funding method must be NAPAS' });
    }

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
        amountIn: amount.toString(),
        assetCode: asset_code,
        senderId: sender_id,
        receiverId: receiver_id,
        status: 'processing_lock',
        quoteId: quote_id || undefined,
        refundMemo: refund_memo || undefined,
        refundMemoType: refund_memo_type || undefined,
      });
      await this.sep31CoreService.insert(tx);
    } catch (error: any) {
      throw error;
    }

    console.log(`[SEP31] Initiating standard disbursement for ${amount} USDC to receiver ${receiver_id}`);

    let receiver_routing_number = 'mock';
    let receiver_account_number = 'mock';
    if (receiver_id) {
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
    }

    let transactionResponse;
    try {
      transactionResponse = await this.sep31Service.createTransaction({
        amount: amount.toString(),
        asset_code,
        sender_id: sender_id || '',
        receiver_id: receiver_id || '',
        quote_id,
        receiver_routing_number,
        receiver_account_number,
      });
    } catch (apError: any) {
      const msg = apError.message || apError.code || '';
      const code = apError.code || '';
      const isAmbiguous =
        msg.includes('timeout') ||
        msg.includes('socket hang up') ||
        code === 'ECONNABORTED' ||
        code === 'ECONNRESET';
      const isConnectionRefused =
        msg.includes('ECONNREFUSED') ||
        code === 'ECONNREFUSED' ||
        msg.includes('Service unreachable');

      if (isAmbiguous) {
        await this.sep31CoreService.update(tempId, {
          status: 'error',
          errorMessage: 'Ambiguous timeout during AP call',
        });
        throw new BadGatewayException({
          error: 'ambiguous_timeout',
          message: 'Transaction is in an ambiguous state due to network timeout. Please contact support.',
        });
      } else if (isConnectionRefused) {
        await this.sep31CoreService.delete(tempId);
        throw new BadGatewayException({
          error: 'ap_service_unavailable',
          message: 'Anchor Platform service is currently unreachable.',
        });
      } else {
        await this.sep31CoreService.delete(tempId);
        if (msg.includes('CUSTOMER_NEEDS_INFO')) {
          throw new BadRequestException({ error: 'customer_info_needed' });
        }
        throw new BadRequestException({ error: 'ap_error', message: msg || 'Anchor Platform error' });
      }
    }

    const transactionId = transactionResponse.id;
    await this.sep31CoreService.updateWithQueryBuilder(tempId, {
      id: transactionId,
      status: 'pending_sender',
      stellarAccount: transactionResponse.stellar_account,
      stellarMemo: transactionResponse.stellar_memo,
      stellarMemoType: transactionResponse.stellar_memo_type,
    });

    return {
      id: transactionId,
      stellar_account_id: transactionResponse.stellar_account,
      stellar_memo_type: transactionResponse.stellar_memo_type,
      stellar_memo: transactionResponse.stellar_memo,
    };
  }

  @Get('transactions/:id')
  @UseGuards(Sep10Guard)
  @HttpCode(HttpStatus.OK)
  async getTransaction(@Param('id') id: string) {
    const tx = await this.sep31CoreService.findById(id);
    if (!tx) {
      throw new BadRequestException({ error: 'transaction_not_found', message: 'Transaction not found' });
    }

    return {
      transaction: {
        id: tx.id,
        status: tx.status,
        amount_in: tx.amountIn,
        amount_in_asset: `stellar:${tx.assetCode}:${this.envService.get('USDC_ISSUER')}`,
        amount_out: tx.vndAmount ? tx.vndAmount.toString() : undefined,
        amount_out_asset: 'iso4217:VND',
        stellar_account_id: tx.stellarAccount,
        stellar_memo: tx.stellarMemo,
        stellar_memo_type: tx.stellarMemoType,
        stellar_transaction_id: tx.stellarTxHash,
        external_transaction_id: tx.napasRefId,
        started_at: tx.createdAt ? tx.createdAt.toISOString() : undefined,
        updated_at: tx.updatedAt ? tx.updatedAt.toISOString() : undefined,
      },
    };
  }

  @Patch('transactions/:id')
  @UseGuards(Sep10Guard)
  @HttpCode(HttpStatus.OK)
  async patchTransaction(@Param('id') id: string, @Body() body: any) {
    const tx = await this.sep31CoreService.findById(id);
    if (!tx) {
      throw new BadRequestException({ error: 'transaction_not_found', message: 'Transaction not found' });
    }

    const { refund_memo, refund_memo_type } = body;
    const updateData: any = {};
    if (refund_memo !== undefined) updateData.refundMemo = refund_memo;
    if (refund_memo_type !== undefined) updateData.refundMemoType = refund_memo_type;

    if (Object.keys(updateData).length > 0) {
      await this.sep31CoreService.update(id, updateData);
    }

    console.log(`[SEP31] PATCH transaction ${id}`, body);
    return { success: true };
  }

  @Put('transactions/:id/callback')
  @UseGuards(Sep10Guard)
  @HttpCode(HttpStatus.OK)
  async putTransactionCallback(@Param('id') id: string, @Body() body: { url: string }) {
    if (!body || !body.url || typeof body.url !== 'string' || !body.url.startsWith('http')) {
      throw new BadRequestException({ error: 'invalid_callback_url', message: 'Invalid callback URL' });
    }

    const tx = await this.sep31CoreService.findById(id);
    if (!tx) {
      throw new BadRequestException({ error: 'transaction_not_found', message: 'Transaction not found' });
    }

    await this.sep31CoreService.update(id, { callbackUrl: body.url });

    console.log(`[SEP31] PUT transaction callback ${id} -> ${body.url}`);
    return { success: true };
  }
}
