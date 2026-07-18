import {
  Controller,
  Get,
  Query,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { OracleService } from '@uc/banking';

@Controller('prices')
export class PricesController {
  constructor(private readonly oracleService: OracleService) {}

  @Get()
  async getPrices(
    @Query('sell_asset') sell_asset?: string,
    @Query('buy_asset') buy_asset?: string,
    @Query('sell_amount') sell_amount?: string,
    @Query('buy_amount') buy_amount?: string,
    @Query('sell_delivery_method') sell_delivery_method?: string,
    @Query('buy_delivery_method') buy_delivery_method?: string,
    @Query('country_code') country_code?: string,
  ) {
    if (!sell_asset || !buy_asset) {
      throw new BadRequestException('sell_asset and buy_asset are required');
    }
    
    if (!sell_amount && !buy_amount) {
      throw new BadRequestException('Either sell_amount or buy_amount must be provided');
    }

    if (sell_amount && buy_amount) {
      throw new BadRequestException('Provide either sell_amount or buy_amount, not both');
    }

    let baseRate: number;
    try {
      const oracleResult = await this.oracleService.getSafeFxRate();
      baseRate = oracleResult.rate;
    } catch (apiError: any) {
      console.error('[Prices API] Oracle error:', apiError.message);
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

    if (sell_amount) {
      return {
        buy_assets: [
          {
            asset: buy_asset,
            price: price,
            decimals: 0,
          },
        ],
      };
    } else {
      return {
        sell_assets: [
          {
            asset: sell_asset,
            price: price,
            decimals: 7,
          },
        ],
      };
    }
  }
}
