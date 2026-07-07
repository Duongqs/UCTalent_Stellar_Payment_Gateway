import { OnModuleInit } from '@nestjs/common';
export declare class SorobanListenerService implements OnModuleInit {
    private rpcServer;
    private contractId;
    private watchedContracts;
    private lastProcessedLedger;
    private isPolling;
    onModuleInit(): Promise<void>;
    private setLastProcessedLedger;
    private saveWatchedContracts;
    pollEvents(): Promise<void>;
    private enqueueEvent;
    private scanChildContractEvents;
}
