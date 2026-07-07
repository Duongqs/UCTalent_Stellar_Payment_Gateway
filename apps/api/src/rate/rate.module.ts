import { Module } from '@nestjs/common';
import { RateController } from './rate.controller';

@Module({
  controllers: [RateController],
})
export class RateModule {}
