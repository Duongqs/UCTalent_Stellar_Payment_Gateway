import { Injectable, OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { rpc, scValToNative, xdr } from '@stellar/stellar-sdk';
import { SyncStateEntity, BridgeEventQueueEntity, EnvService } from '@uc/core';

function toNative(scValOrBase64: any): any {
  try {
    let scVal = scValOrBase64;
    if (typeof scVal === 'string') {
      scVal = xdr.ScVal.fromXDR(scVal, 'base64');
    } else if (scVal && scVal.xdr) {
      scVal = xdr.ScVal.fromXDR(scVal.xdr, 'base64');
    }
    return scValToNative(scVal);
  } catch (err) {
    return null;
  }
}

@Injectable()
export class SorobanListenerService implements OnModuleInit {
  private rpcServer!: rpc.Server;
  private contractId!: string;
  private watchedContracts: string[] = [];
  private lastProcessedLedger = 0;
  private isPolling = false;

  constructor(
    @InjectRepository(SyncStateEntity)
    private readonly syncStateRepo: Repository<SyncStateEntity>,
    @InjectRepository(BridgeEventQueueEntity)
    private readonly eventQueueRepo: Repository<BridgeEventQueueEntity>,
    private readonly envService: EnvService,
  ) {}

  private stroopsToUsdc(stroops: any): number {
    const decimals = this.envService.get('TOKEN_DECIMALS') ?? 7;
    return Number(BigInt(stroops || 0)) / Math.pow(10, decimals);
  }

  async onModuleInit() {
    const rpcUrl =
      this.envService.get('SOROBAN_RPC_URL') ||
      'https://rpc-testnet.stellar.org';
    this.contractId = this.envService.get('ESCROW_CONTRACT_ID') || '';

    if (!this.contractId) {
      console.error(
        '❌ ESCROW_CONTRACT_ID is not set in env config — cannot listen for events.',
      );
      return;
    }

    this.rpcServer = new rpc.Server(rpcUrl);
    this.watchedContracts = [this.contractId];

    // Load persisted state from PostgreSQL/SQLite
    try {
      const ledgerRow = await this.syncStateRepo.findOne({
        where: { key: 'last_processed_ledger' },
      });
      if (ledgerRow) {
        this.lastProcessedLedger = parseInt(ledgerRow.value, 10);
      } else {
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

      console.log(
        `[Soroban Listener] Initialized. Last ledger: ${this.lastProcessedLedger}. Watched contracts: ${this.watchedContracts.length}`,
      );
    } catch (err: any) {
      console.error('[Soroban Listener] Initialization error:', err.message);
    }
  }

  private async setLastProcessedLedger(ledger: number) {
    let row = await this.syncStateRepo.findOne({
      where: { key: 'last_processed_ledger' },
    });
    if (!row) {
      row = new SyncStateEntity();
      row.key = 'last_processed_ledger';
    }
    row.value = ledger.toString();
    await this.syncStateRepo.save(row);
  }

  private async saveWatchedContracts() {
    let row = await this.syncStateRepo.findOne({
      where: { key: 'watched_contracts' },
    });
    if (!row) {
      row = new SyncStateEntity();
      row.key = 'watched_contracts';
    }
    row.value = JSON.stringify(this.watchedContracts);
    await this.syncStateRepo.save(row);
  }

  @Interval(5000)
  async pollEvents() {
    if (this.isPolling || !this.rpcServer) return;
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
          type: 'contract' as const,
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
        console.log(
          `[Soroban Listener] Ledgers ${this.lastProcessedLedger} → ${currentLedger}: found ${events.length} event(s)`,
        );
      }

      for (const event of events) {
        await this.enqueueEvent(event);
      }

      this.lastProcessedLedger = currentLedger;
      await this.setLastProcessedLedger(currentLedger);
    } catch (err: any) {
      console.error('[Soroban Listener] Poll error:', err.message);
    } finally {
      this.isPolling = false;
    }
  }

  private async enqueueEvent(event: any) {
    const topics = event.topic || [];
    if (topics.length < 2) return;

    const contractIdStr = event.contractId.toString();

    // Factory escrow creation discovery
    if (contractIdStr === this.contractId) {
      try {
        const t0 = toNative(topics[0]);
        const t1 = toNative(topics[1]);
        if (t0 === 'uctalent_factory' && t1 === 'escrow_created') {
          const childAddr = toNative(event.value);
          if (childAddr && !this.watchedContracts.includes(childAddr)) {
            this.watchedContracts.push(childAddr);
            await this.saveWatchedContracts();
            console.log(
              `🌟 [Soroban Listener] Discovered escrow contract: ${childAddr}`,
            );
            await this.scanChildContractEvents(childAddr, event.ledger);
          }
        }
      } catch (e) {}
      return;
    }

    let t0, t1;
    try {
      t0 = toNative(topics[0]);
      t1 = topics.length > 1 ? toNative(topics[1]) : '';
      if (!(
        t0 === 'uctalent' &&
        (t1 === 'referral_settled' || t1 === 'milestone_released')
      )) {
        return;
      }
    } catch (e) {
      return;
    }

    const decoded = toNative(event.value);
    if (!Array.isArray(decoded)) return;

    const payload: any = {
      stellarTxHash: event.txHash,
      stellarMemo: `UCT_${event.ledger}_${event.txHash.substring(0, 8).toUpperCase()}`,
      ledgerSequence: event.ledger,
      timestamp: new Date().toISOString(),
    };

    if (t1 === 'referral_settled') {
      if (decoded.length < 6) return;
      const [
        jobIdRaw,
        recipientRaw,
        bountyRaw,
        scoutShareRaw,
        platformShareRaw,
        scoutKycId,
      ] = decoded;

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
    } else if (t1 === 'milestone_released') {
      if (decoded.length < 4) return;
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
        console.log(
          `📥 [Soroban Listener] Queued event from ${event.txHash} (Ledger ${event.ledger})`,
        );
      }
    } catch (err: any) {
      console.error(
        `❌ [Soroban Listener] Failed to queue event:`,
        err.message,
      );
    }
  }

  private async scanChildContractEvents(
    childAddr: string,
    startLedger: number,
  ) {
    try {
      const response = await this.rpcServer.getEvents({
        startLedger: startLedger,
        filters: [{ type: 'contract', contractIds: [childAddr] }],
        limit: 10,
      });
      for (const ev of response?.events || []) {
        await this.enqueueEvent(ev);
      }
    } catch (err: any) {
      console.error(
        `[Soroban Listener] Post-discovery scan failed for ${childAddr}:`,
        err.message,
      );
    }
  }
}
