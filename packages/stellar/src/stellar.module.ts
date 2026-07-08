import { Module, Global } from '@nestjs/common';
import { Sep31TransactionService } from './services/sep31-transaction.service';
import { AnchorRpcService } from './services/anchor-rpc.service';

@Global()
@Module({
  providers: [Sep31TransactionService, AnchorRpcService],
  exports: [Sep31TransactionService, AnchorRpcService],
})
export class StellarModule {}
