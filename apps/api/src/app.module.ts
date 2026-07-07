import { Module } from '@nestjs/common';
import { KycModule } from './kyc/kyc.module';
import { RateModule } from './rate/rate.module';
import { BankVaultModule } from './bank-vault/bank-vault.module';
import { Sep31Module } from './sep31/sep31.module';
import { IpnModule } from './ipn/ipn.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    KycModule,
    RateModule,
    BankVaultModule,
    Sep31Module,
    IpnModule,
    HealthModule,
  ],
})
export class AppModule {}
