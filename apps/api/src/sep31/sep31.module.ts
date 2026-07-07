import { Module } from '@nestjs/common';
import { Sep31Controller } from './sep31.controller';

@Module({
  controllers: [Sep31Controller],
})
export class Sep31Module {}
