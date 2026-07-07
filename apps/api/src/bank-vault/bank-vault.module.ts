import { Module } from '@nestjs/common';
import { BankVaultController } from './bank-vault.controller';

@Module({
  controllers: [BankVaultController],
})
export class BankVaultModule {}
