import { Repository } from 'typeorm';
import { BridgeEventQueueEntity, EnvService } from '@uc/core';
export declare class EventConsumerService {
    private readonly eventQueueRepo;
    private readonly envService;
    private isProcessing;
    constructor(eventQueueRepo: Repository<BridgeEventQueueEntity>, envService: EnvService);
    processQueue(): Promise<void>;
}
