import {
  Controller,
  Get,
  Query,
  BadRequestException,
  ServiceUnavailableException,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import { OracleService } from '@uc/banking';
import { FirmQuoteService, AuditLogService, EnvService } from '@uc/core';
import { v4 as uuidv4 } from 'uuid';

@Controller('rate')
export class RateController {
  constructor(
    private readonly firmQuoteService: FirmQuoteService,
    private readonly oracleService: OracleService,
    private readonly auditLog: AuditLogService,
    private readonly envService: EnvService,
  ) {}

  @Get('info')
  async getInfo() {
    return {
      assets: [
        {
          asset: `stellar:USDC:${this.envService.get('USDC_ISSUER') || 'G_DUMMY_ISSUER'}`,
          buy_delivery_methods: [
            { name: 'NAPAS', description: 'NAPAS 247 Instant Transfer' },
          ],
        },
        {
          asset: 'iso4217:VND',
          country_codes: ['VN'],
          buy_delivery_methods: [
            { name: 'NAPAS', description: 'NAPAS 247 Instant Transfer' },
          ],
        },
      ],
    };
  }

  @Get()
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
      throw new BadRequestException(
        'Valid type (indicative or firm) is required',
      );
    }

    if (buy_delivery_method && buy_delivery_method !== 'NAPAS') {
      throw new BadRequestException(
        'Unsupported buy_delivery_method. Only NAPAS is supported.',
      );
    }

    let baseRate: number;
    try {
      const oracleResult = await this.oracleService.getSafeFxRate();
      baseRate = oracleResult.rate;
    } catch (apiError: any) {
      console.error('[Rate API] Oracle error:', apiError.message);
      throw new ServiceUnavailableException(
        'Exchange rate service unavailable. Please try again later.',
      );
    }

    if (!baseRate || typeof baseRate !== 'number' || Number.isNaN(baseRate) || baseRate <= 0) {
      throw new ServiceUnavailableException(
        'Exchange rate service returned an invalid rate.',
      );
    }

    const feeAmount = '0';
    const rateObj: any = {
      price: (1 / baseRate).toFixed(10).replace(/\.?0+$/, ''),
      fee: {
        total: feeAmount,
        asset:
          sell_asset ||
          `stellar:USDC:${this.envService.get('USDC_ISSUER') || 'G_DUMMY_ISSUER'}`,
      },
    };

    if (sell_amount && buy_amount) {
      throw new BadRequestException(
        'Please provide either sell_amount or buy_amount, but not both',
      );
    }

    if (sell_amount) {
      rateObj.sell_amount = sell_amount;
      rateObj.buy_amount = Math.floor(
        parseFloat(sell_amount) * baseRate,
      ).toString();
      rateObj.price = (
        parseFloat(rateObj.sell_amount) / parseFloat(rateObj.buy_amount)
      ).toFixed(15).replace(/\.?0+$/, '');
    } else if (buy_amount) {
      rateObj.buy_amount = buy_amount;
      rateObj.sell_amount = (parseFloat(buy_amount) / baseRate)
        .toFixed(7)
        .replace(/\.?0+$/, '');
      rateObj.price = (
        parseFloat(rateObj.sell_amount) / parseFloat(rateObj.buy_amount)
      ).toFixed(15).replace(/\.?0+$/, '');
    } else {
      throw new BadRequestException(
        'Either sell_amount or buy_amount must be provided',
      );
    }

    if (type === 'firm') {
      const activeContext = context ? context.toLowerCase() : 'sep31';
      if (!['sep6', 'sep24', 'sep31'].includes(activeContext)) {
        throw new BadRequestException(
          'context must be one of sep6, sep24, or sep31 for firm quotes',
        );
      }

      const quoteId = uuidv4();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

      const quote = this.firmQuoteService.create({
        id: quoteId,
        sellAsset:
          sell_asset ||
          `stellar:USDC:${this.envService.get('USDC_ISSUER') || 'G_DUMMY_ISSUER'}`,
        buyAsset: buy_asset || 'iso4217:VND',
        sellAmount: rateObj.sell_amount.toString(),
        buyAmount: rateObj.buy_amount.toString(),
        rate: rateObj.price.toString(),
        context: activeContext,
        expiresAt,
      });
      await this.firmQuoteService.save(quote);

      await this.auditLog.log(quoteId, 'quote_locked', {
        rate: rateObj.price,
        sell_amount: rateObj.sell_amount,
        buy_amount: rateObj.buy_amount,
        context: activeContext,
      });

      rateObj.id = quoteId;
      rateObj.expires_at = expiresAt.toISOString();
    }

    return { rate: rateObj };
  }
}
