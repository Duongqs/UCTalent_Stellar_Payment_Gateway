import { Module } from '@nestjs/common';
import { CoreModule } from '@uc/core';
import { StellarModule } from '@uc/stellar';
import { BankingModule } from '@uc/banking';
import { KycModule } from './kyc/kyc.module';
import { RateModule } from './rate/rate.module';
import { BankVaultModule } from './bank-vault/bank-vault.module';
import { Sep31Module } from './sep31/sep31.module';
import { IpnModule } from './ipn/ipn.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    CoreModule,
    StellarModule,
    BankingModule,
    KycModule,
    RateModule,
    BankVaultModule,
    Sep31Module,
    IpnModule,
    HealthModule,
  ],
})
export class AppModule {}
