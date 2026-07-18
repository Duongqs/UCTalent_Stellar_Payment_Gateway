import { Module } from '@nestjs/common';
import { Sep31Controller } from './sep31.controller';
import { AnchorController } from './anchor.controller';

import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [Sep31Controller, AnchorController],
})
export class Sep31Module {}
