import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

import { Sep10Guard } from './guards/sep10.guard';

@Module({
  controllers: [AuthController],
  providers: [AuthService, Sep10Guard],
  exports: [AuthService, Sep10Guard]
})
export class AuthModule {}
