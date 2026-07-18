import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { FirmQuoteService, AuditLogService, EnvService } from '@uc/core';
import { OracleService } from '@uc/banking';
import { v4 as uuidv4 } from 'uuid';
import { PostQuoteDto } from './dto/post-quote.dto';
import { Sep10Guard } from '../auth/guards/sep10.guard';

@Controller('quote')
export class QuoteController {
  constructor(
    private readonly firmQuoteService: FirmQuoteService,
    private readonly oracleService: OracleService,
    private readonly auditLog: AuditLogService,
    private readonly envService: EnvService,
  ) {}

  @Post()
  @UseGuards(Sep10Guard)
  async createQuote(@Body() body: PostQuoteDto) {
    if (body.buy_delivery_method && body.buy_delivery_method !== 'NAPAS') {
      throw new BadRequestException(
        'Unsupported buy_delivery_method. Only NAPAS is supported.',
      );
    }

    let baseRate: number;
    try {
      const oracleResult = await this.oracleService.getSafeFxRate();
      baseRate = oracleResult.rate;
    } catch (apiError: any) {
      console.error('[Quote API] Oracle error:', apiError.message);
      throw new ServiceUnavailableException(
        'Exchange rate service unavailable. Please try again later.',
      );
    }

    if (!baseRate || typeof baseRate !== 'number' || Number.isNaN(baseRate) || baseRate <= 0) {
      throw new ServiceUnavailableException(
        'Exchange rate service returned an invalid rate.',
      );
    }

    const price = (1 / baseRate).toFixed(10).replace(/\.?0+$/, '');
    let sellAmountStr = '';
    let buyAmountStr = '';

    if (body.sell_amount) {
      sellAmountStr = body.sell_amount;
      buyAmountStr = Math.floor(
        parseFloat(body.sell_amount) * baseRate,
      ).toString();
    } else if (body.buy_amount) {
      buyAmountStr = body.buy_amount;
      sellAmountStr = (parseFloat(body.buy_amount) / baseRate)
        .toFixed(7)
        .replace(/\.?0+$/, '');
    }

    const quoteId = uuidv4();
    const expiresAt = body.expire_after 
      ? new Date(body.expire_after) 
      : new Date(Date.now() + 15 * 60 * 1000);

    const quote = this.firmQuoteService.create({
      id: quoteId,
      sellAsset: body.sell_asset,
      buyAsset: body.buy_asset,
      sellAmount: sellAmountStr,
      buyAmount: buyAmountStr,
      rate: price,
      context: body.context,
      expiresAt,
    });
    
    await this.firmQuoteService.save(quote);

    await this.auditLog.log(quoteId, 'quote_locked', {
      rate: price,
      sell_amount: sellAmountStr,
      buy_amount: buyAmountStr,
      context: body.context,
    });

    return {
      id: quoteId,
      expires_at: expiresAt.toISOString(),
      total_price: sellAmountStr,
      price: price,
      sell_asset: body.sell_asset,
      sell_amount: sellAmountStr,
      buy_asset: body.buy_asset,
      buy_amount: buyAmountStr,
      fee: {
        total: '0',
        asset: body.sell_asset,
        details: [],
      },
    };
  }

  @Get(':id')
  @UseGuards(Sep10Guard)
  async getQuote(@Param('id') id: string) {
    const quote = await this.firmQuoteService.findById(id);

    if (!quote) {
      throw new NotFoundException('Quote not found');
    }

    if (quote.usedAt) {
      throw new ConflictException('Quote already used');
    }
    
    const price = (parseFloat(quote.sellAmount) / parseFloat(quote.buyAmount))
      .toFixed(10)
      .replace(/\.?0+$/, '');

    return {
      id: quote.id,
      expires_at: quote.expiresAt.toISOString(),
      total_price: quote.sellAmount,
      price: price,
      sell_asset: quote.sellAsset,
      sell_amount: quote.sellAmount,
      buy_asset: quote.buyAsset,
      buy_amount: quote.buyAmount,
      fee: {
        total: '0',
        asset: quote.sellAsset,
        details: [],
      },
    };
  }
}
