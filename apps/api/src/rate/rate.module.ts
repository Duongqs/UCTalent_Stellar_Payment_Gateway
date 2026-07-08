import { Module } from '@nestjs/common';
import { RateController } from './rate.controller';
import { QuoteController } from './quote.controller';

@Module({
  controllers: [RateController, QuoteController],
})
export class RateModule {}
