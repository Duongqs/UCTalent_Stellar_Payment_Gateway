import { Module, Global } from '@nestjs/common';
import { StellarModule } from '@uc/stellar';
import { NinePayGatewayService } from './services/ninepay-gateway.service';
import { NinePayMockService } from './services/ninepay-mock.service';
import { OracleService } from './services/oracle.service';
import { BankVaultService } from './services/bank-vault.service';
import { NameMatchingService } from './services/name-matching.service';

@Global()
@Module({
  imports: [StellarModule],
  providers: [
    NinePayGatewayService,
    NinePayMockService,
    OracleService,
    BankVaultService,
    NameMatchingService,
  ],
  exports: [
    NinePayGatewayService,
    NinePayMockService,
    OracleService,
    BankVaultService,
    NameMatchingService,
  ],
})
export class BankingModule {}
