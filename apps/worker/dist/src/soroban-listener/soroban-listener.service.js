"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SorobanListenerService = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const stellar_sdk_1 = require("@stellar/stellar-sdk");
const core_1 = require("@uc/core");
function toNative(scValOrBase64) {
    try {
        let scVal = scValOrBase64;
        if (typeof scVal === 'string') {
            scVal = stellar_sdk_1.xdr.ScVal.fromXDR(scVal, 'base64');
        }
        else if (scVal && scVal.xdr) {
            scVal = stellar_sdk_1.xdr.ScVal.fromXDR(scVal.xdr, 'base64');
        }
        return (0, stellar_sdk_1.scValToNative)(scVal);
    }
    catch (err) {
        return null;
    }
}
let SorobanListenerService = class SorobanListenerService {
    syncStateRepo;
    eventQueueRepo;
    envService;
    rpcServer;
    contractId;
    watchedContracts = [];
    lastProcessedLedger = 0;
    isPolling = false;
    constructor(syncStateRepo, eventQueueRepo, envService) {
        this.syncStateRepo = syncStateRepo;
        this.eventQueueRepo = eventQueueRepo;
        this.envService = envService;
    }
    stroopsToUsdc(stroops) {
        const decimals = this.envService.get('TOKEN_DECIMALS') ?? 7;
        return Number(BigInt(stroops || 0)) / Math.pow(10, decimals);
    }
    async onModuleInit() {
        const rpcUrl = this.envService.get('SOROBAN_RPC_URL') ||
            'https://rpc-testnet.stellar.org';
        this.contractId = this.envService.get('ESCROW_CONTRACT_ID') || '';
        if (!this.contractId) {
            console.error('❌ ESCROW_CONTRACT_ID is not set in env config — cannot listen for events.');
            return;
        }
        this.rpcServer = new stellar_sdk_1.rpc.Server(rpcUrl);
        this.watchedContracts = [this.contractId];
        try {
            const ledgerRow = await this.syncStateRepo.findOne({
                where: { key: 'last_processed_ledger' },
            });
            if (ledgerRow) {
                this.lastProcessedLedger = parseInt(ledgerRow.value, 10);
            }
            else {
                const latest = await this.rpcServer.getLatestLedger();
                this.lastProcessedLedger = latest.sequence;
                await this.setLastProcessedLedger(this.lastProcessedLedger);
            }
            const contractsRow = await this.syncStateRepo.findOne({
                where: { key: 'watched_contracts' },
            });
            if (contractsRow) {
                this.watchedContracts = JSON.parse(contractsRow.value);
            }
            console.log(`[Soroban Listener] Initialized. Last ledger: ${this.lastProcessedLedger}. Watched contracts: ${this.watchedContracts.length}`);
        }
        catch (err) {
            console.error('[Soroban Listener] Initialization error:', err.message);
        }
    }
    async setLastProcessedLedger(ledger) {
        let row = await this.syncStateRepo.findOne({
            where: { key: 'last_processed_ledger' },
        });
        if (!row) {
            row = new core_1.SyncStateEntity();
            row.key = 'last_processed_ledger';
        }
        row.value = ledger.toString();
        await this.syncStateRepo.save(row);
    }
    async saveWatchedContracts() {
        let row = await this.syncStateRepo.findOne({
            where: { key: 'watched_contracts' },
        });
        if (!row) {
            row = new core_1.SyncStateEntity();
            row.key = 'watched_contracts';
        }
        row.value = JSON.stringify(this.watchedContracts);
        await this.syncStateRepo.save(row);
    }
    async pollEvents() {
        if (this.isPolling || !this.rpcServer)
            return;
        this.isPolling = true;
        try {
            const latest = await this.rpcServer.getLatestLedger();
            const currentLedger = latest.sequence;
            if (currentLedger <= this.lastProcessedLedger) {
                this.isPolling = false;
                return;
            }
            const uniqueContracts = [
                ...new Set([this.contractId, ...this.watchedContracts]),
            ];
            const filters = [];
            for (let i = 0; i < uniqueContracts.length; i += 5) {
                filters.push({
                    type: 'contract',
                    contractIds: uniqueContracts.slice(i, i + 5),
                });
            }
            const response = await this.rpcServer.getEvents({
                startLedger: this.lastProcessedLedger + 1,
                filters: filters,
                limit: 100,
            });
            const events = response?.events || [];
            if (events.length > 0) {
                console.log(`[Soroban Listener] Ledgers ${this.lastProcessedLedger} → ${currentLedger}: found ${events.length} event(s)`);
            }
            for (const event of events) {
                await this.enqueueEvent(event);
            }
            this.lastProcessedLedger = currentLedger;
            await this.setLastProcessedLedger(currentLedger);
        }
        catch (err) {
            console.error('[Soroban Listener] Poll error:', err.message);
        }
        finally {
            this.isPolling = false;
        }
    }
    async enqueueEvent(event) {
        const topics = event.topic || [];
        if (topics.length < 2)
            return;
        const contractIdStr = event.contractId.toString();
        if (contractIdStr === this.contractId) {
            try {
                const t0 = toNative(topics[0]);
                const t1 = toNative(topics[1]);
                if (t0 === 'uctalent_factory' && t1 === 'escrow_created') {
                    const childAddr = toNative(event.value);
                    if (childAddr && !this.watchedContracts.includes(childAddr)) {
                        this.watchedContracts.push(childAddr);
                        await this.saveWatchedContracts();
                        console.log(`🌟 [Soroban Listener] Discovered escrow contract: ${childAddr}`);
                        await this.scanChildContractEvents(childAddr, event.ledger);
                    }
                }
            }
            catch (e) { }
            return;
        }
        let t0, t1;
        try {
            t0 = toNative(topics[0]);
            t1 = topics.length > 1 ? toNative(topics[1]) : '';
            if (!(t0 === 'uctalent' &&
                (t1 === 'referral_settled' || t1 === 'milestone_released'))) {
                return;
            }
        }
        catch (e) {
            return;
        }
        const decoded = toNative(event.value);
        if (!Array.isArray(decoded))
            return;
        const payload = {
            stellarTxHash: event.txHash,
            stellarMemo: `UCT_${event.ledger}_${event.txHash.substring(0, 8).toUpperCase()}`,
            ledgerSequence: event.ledger,
            timestamp: new Date().toISOString(),
        };
        if (t1 === 'referral_settled') {
            if (decoded.length < 6)
                return;
            const [jobIdRaw, recipientRaw, bountyRaw, scoutShareRaw, platformShareRaw, scoutKycId,] = decoded;
            payload.trackingId =
                typeof jobIdRaw === 'string'
                    ? jobIdRaw
                    : Buffer.isBuffer(jobIdRaw)
                        ? jobIdRaw.toString()
                        : String(jobIdRaw);
            payload.recipient =
                typeof recipientRaw === 'string' ? recipientRaw : String(recipientRaw);
            payload.bountyAmount = this.stroopsToUsdc(bountyRaw);
            payload.splits = {
                scout: {
                    amountUsdc: this.stroopsToUsdc(scoutShareRaw),
                    kycId: Buffer.isBuffer(scoutKycId)
                        ? scoutKycId.toString('hex')
                        : String(scoutKycId),
                },
                platform: {
                    amountUsdc: this.stroopsToUsdc(platformShareRaw),
                    kycId: null,
                },
            };
        }
        else if (t1 === 'milestone_released') {
            if (decoded.length < 4)
                return;
            const [gigIdRaw, indexRaw, amountRaw, freelancerRaw] = decoded;
            payload.trackingId =
                typeof gigIdRaw === 'string'
                    ? gigIdRaw
                    : Buffer.isBuffer(gigIdRaw)
                        ? gigIdRaw.toString()
                        : String(gigIdRaw);
            payload.milestoneIndex = Number(indexRaw);
            payload.recipient =
                typeof freelancerRaw === 'string'
                    ? freelancerRaw
                    : String(freelancerRaw);
            payload.bountyAmount = this.stroopsToUsdc(amountRaw);
            payload.splits = {
                talent: { amountUsdc: this.stroopsToUsdc(amountRaw), kycId: null },
            };
        }
        try {
            const existing = await this.eventQueueRepo.findOne({
                where: { txHash: event.txHash },
            });
            if (!existing) {
                const queueEntry = this.eventQueueRepo.create({
                    ledger: event.ledger,
                    txHash: event.txHash,
                    contractId: contractIdStr,
                    payloadJson: payload,
                    status: 'pending',
                });
                await this.eventQueueRepo.save(queueEntry);
                console.log(`📥 [Soroban Listener] Queued event from ${event.txHash} (Ledger ${event.ledger})`);
            }
        }
        catch (err) {
            console.error(`❌ [Soroban Listener] Failed to queue event:`, err.message);
        }
    }
    async scanChildContractEvents(childAddr, startLedger) {
        try {
            const response = await this.rpcServer.getEvents({
                startLedger: startLedger,
                filters: [{ type: 'contract', contractIds: [childAddr] }],
                limit: 10,
            });
            for (const ev of response?.events || []) {
                await this.enqueueEvent(ev);
            }
        }
        catch (err) {
            console.error(`[Soroban Listener] Post-discovery scan failed for ${childAddr}:`, err.message);
        }
    }
};
exports.SorobanListenerService = SorobanListenerService;
__decorate([
    (0, schedule_1.Interval)(5000),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], SorobanListenerService.prototype, "pollEvents", null);
exports.SorobanListenerService = SorobanListenerService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(core_1.SyncStateEntity)),
    __param(1, (0, typeorm_1.InjectRepository)(core_1.BridgeEventQueueEntity)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        core_1.EnvService])
], SorobanListenerService);
//# sourceMappingURL=soroban-listener.service.js.map