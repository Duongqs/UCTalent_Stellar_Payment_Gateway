import {
  Controller,
  Get,
  Param,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { FirmQuoteService } from '@uc/core';

@Controller('quote')
export class QuoteController {
  constructor(private readonly firmQuoteService: FirmQuoteService) {}

  @Get(':id')
  async getQuote(@Param('id') id: string) {
    const quote = await this.firmQuoteService.findById(id);

    if (!quote) {
      throw new NotFoundException('Quote not found');
    }

    if (quote.expiresAt && new Date(quote.expiresAt) < new Date()) {
      throw new BadRequestException('Quote expired');
    }

    if (quote.usedAt) {
      throw new ConflictException('Quote already used');
    }

    return {
      id: quote.id,
      price: (parseFloat(quote.sellAmount) / parseFloat(quote.buyAmount))
        .toFixed(10)
        .replace(/\.?0+$/, ''),
      sell_asset: quote.sellAsset,
      buy_asset: quote.buyAsset,
      sell_amount: quote.sellAmount,
      buy_amount: quote.buyAmount,
      expires_at: quote.expiresAt,
      fee: {
        total: '0',
        asset: quote.sellAsset,
      },
    };
  }
}
