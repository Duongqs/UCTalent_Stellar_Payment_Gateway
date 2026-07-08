import { OnModuleInit } from '@nestjs/common';
import { Repository } from 'typeorm';
import { SyncStateEntity, BridgeEventQueueEntity, EnvService } from '@uc/core';
export declare class SorobanListenerService implements OnModuleInit {
    private readonly syncStateRepo;
    private readonly eventQueueRepo;
    private readonly envService;
    private rpcServer;
    private contractId;
    private watchedContracts;
    private lastProcessedLedger;
    private isPolling;
    constructor(syncStateRepo: Repository<SyncStateEntity>, eventQueueRepo: Repository<BridgeEventQueueEntity>, envService: EnvService);
    private stroopsToUsdc;
    onModuleInit(): Promise<void>;
    private setLastProcessedLedger;
    private saveWatchedContracts;
    pollEvents(): Promise<void>;
    private enqueueEvent;
    private scanChildContractEvents;
}
