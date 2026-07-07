import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { SorobanListenerService } from './soroban-listener/soroban-listener.service';
import { EventConsumerService } from './soroban-listener/event-consumer.service';
import { DisbursementPollerService } from './disbursement/disbursement-poller.service';

@Module({
  imports: [
    ScheduleModule.forRoot(),
  ],
  providers: [
    SorobanListenerService,
    EventConsumerService,
    DisbursementPollerService,
  ],
})
export class AppModule {}
