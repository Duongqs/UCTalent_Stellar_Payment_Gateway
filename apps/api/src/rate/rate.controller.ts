import { 
  Controller, 
  Get, 
  Query, 
  Param, 
  BadRequestException, 
  NotFoundException, 
  ConflictException, 
  ServiceUnavailableException,
  HttpStatus,
  HttpCode
} from '@nestjs/common';
import { getSafeFxRate } from '@uc/banking';
import { query, auditLog } from '@uc/core';
import { v4 as uuidv4 } from 'uuid';

@Controller()
export class RateController {
  @Get('rate')
  async getRate(
    @Query('type') type?: string,
    @Query('sell_asset') sell_asset?: string,
    @Query('buy_asset') buy_asset?: string,
    @Query('sell_amount') sell_amount?: string,
    @Query('buy_amount') buy_amount?: string,
    @Query('context') context?: string,
    @Query('buy_delivery_method') buy_delivery_method?: string,
  ) {
    if (!type || (type !== 'indicative' && type !== 'firm')) {
      throw new BadRequestException('Valid type (indicative or firm) is required');
    }

    if (buy_delivery_method && buy_delivery_method !== 'NAPAS') {
      throw new BadRequestException('Unsupported buy_delivery_method. Only NAPAS is supported.');
    }

    let baseRate: number;
    try {
      const oracleResult = await getSafeFxRate();
      baseRate = oracleResult.rate;
    } catch (apiError: any) {
      console.error('[Rate API] Oracle error:', apiError.message);
      throw new ServiceUnavailableException('Exchange rate service unavailable. Please try again later.');
    }

    const feeAmount = '0';
    const rateObj: any = {
      price: (1 / baseRate).toFixed(10).replace(/\.?0+$/, ''),
      fee: {
        total: feeAmount,
        asset: sell_asset || 'stellar:USDC:GBBD47IF6LWK7P7MDEVSCZA7CFYGLVOLO25E34XDBIEU7E5XPIUBIVGF',
      },
    };

    if (sell_amount && buy_amount) {
      throw new BadRequestException('Please provide either sell_amount or buy_amount, but not both');
    }

    if (sell_amount) {
      rateObj.sell_amount = sell_amount;
      rateObj.buy_amount = Math.floor(parseFloat(sell_amount) * baseRate).toString();
    } else if (buy_amount) {
      rateObj.buy_amount = buy_amount;
      rateObj.sell_amount = (parseFloat(buy_amount) / baseRate).toFixed(7).replace(/\.?0+$/, '');
    } else {
      throw new BadRequestException('Either sell_amount or buy_amount must be provided');
    }

    if (type === 'firm') {
      if (!context || !['sep6', 'sep24', 'sep31'].includes(context)) {
        throw new BadRequestException('context must be one of sep6, sep24, or sep31 for firm quotes');
      }

      const quoteId = uuidv4();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

      await query(
        `INSERT INTO firm_quotes (id, sell_asset, buy_asset, sell_amount, buy_amount, rate, context, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          quoteId,
          sell_asset || 'stellar:USDC:GBBD47IF6LWK7P7MDEVSCZA7CFYGLVOLO25E34XDBIEU7E5XPIUBIVGF',
          buy_asset || 'iso4217:VND',
          rateObj.sell_amount,
          rateObj.buy_amount,
          rateObj.price,
          context,
          expiresAt,
        ]
      );

      await auditLog(quoteId, 'quote_locked', {
        rate: rateObj.price,
        sell_amount: rateObj.sell_amount,
        buy_amount: rateObj.buy_amount,
        context,
      });

      rateObj.id = quoteId;
      rateObj.expires_at = expiresAt.toISOString();
    }

    return { rate: rateObj };
  }

  @Get('quote/:id')
  async getQuote(@Param('id') id: string) {
    const quote = await query(
      'SELECT * FROM firm_quotes WHERE id = $1',
      [id]
    );

    if (!quote) {
      throw new NotFoundException('Quote not found');
    }

    if (quote.expires_at && new Date(quote.expires_at) < new Date()) {
      throw new BadRequestException('Quote expired'); // Using 400 for expired quote matching business logic or 410 (custom HTTP status if wanted, but standard exception is fine)
    }

    if (quote.used_at) {
      throw new ConflictException('Quote already used');
    }

    return {
      id: quote.id,
      price: (parseFloat(quote.sell_amount) / parseFloat(quote.buy_amount)).toFixed(10).replace(/\.?0+$/, ''),
      sell_asset: quote.sell_asset,
      buy_asset: quote.buy_asset,
      sell_amount: quote.sell_amount,
      buy_amount: quote.buy_amount,
      expires_at: quote.expires_at,
      fee: {
        total: '0',
        asset: quote.sell_asset
      }
    };
  }
}
