import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { CoreModule } from '@uc/core';
import { StellarModule } from '@uc/stellar';
import { BankingModule } from '@uc/banking';
import { SorobanListenerService } from './soroban-listener/soroban-listener.service';
import { EventConsumerService } from './soroban-listener/event-consumer.service';
import { DisbursementPollerService } from './disbursement/disbursement-poller.service';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    CoreModule,
    StellarModule,
    BankingModule,
  ],
  providers: [
    SorobanListenerService,
    EventConsumerService,
    DisbursementPollerService,
  ],
})
export class AppModule {}
