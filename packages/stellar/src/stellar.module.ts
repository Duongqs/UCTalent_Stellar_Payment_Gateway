import { Module } from '@nestjs/common';
import { StellarService } from './services/stellar.service';
import { Sep31TransactionService } from './services/sep31-transaction.service';
import { AnchorRpcService } from './services/anchor-rpc.service';

@Module({
  providers: [StellarService, Sep31TransactionService, AnchorRpcService],
  exports: [StellarService, Sep31TransactionService, AnchorRpcService],
})
export class StellarModule {}
