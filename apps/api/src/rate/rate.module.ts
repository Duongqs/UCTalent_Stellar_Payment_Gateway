import { Module } from '@nestjs/common';
import { RateController } from './rate.controller';
import { QuoteController } from './quote.controller';
import { PricesController } from './prices.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [RateController, QuoteController, PricesController],
})
export class RateModule {}
