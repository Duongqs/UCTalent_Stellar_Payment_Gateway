import { Module } from '@nestjs/common';
import { IpnController } from './ipn.controller';

@Module({
  controllers: [IpnController],
})
export class IpnModule {}
