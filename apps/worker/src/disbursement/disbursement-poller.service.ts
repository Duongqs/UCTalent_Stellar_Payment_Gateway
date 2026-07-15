import { Injectable } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, MoreThan } from 'typeorm';
import { AnchorRpcService } from '@uc/stellar';
import {
  NinePayGatewayService,
  NinePayMockService,
  OracleService,
} from '@uc/banking';
import {
  Sep31TransactionEntity,
  BankProfileEntity,
  FirmQuoteEntity,
  EncryptionService,
  AuditLogService,
  EnvService,
} from '@uc/core';
import axios from 'axios';

@Injectable()
export class DisbursementPollerService {
  private isPolling = false;

  constructor(
    @InjectRepository(Sep31TransactionEntity)
    private readonly sep31Repo: Repository<Sep31TransactionEntity>,
    @InjectRepository(BankProfileEntity)
    private readonly bankProfileRepo: Repository<BankProfileEntity>,
    @InjectRepository(FirmQuoteEntity)
    private readonly firmQuoteRepo: Repository<FirmQuoteEntity>,
    private readonly anchorRpc: AnchorRpcService,
    private readonly ninePayGateway: NinePayGatewayService,
    private readonly ninePayMock: NinePayMockService,
    private readonly oracleService: OracleService,
    private readonly encryption: EncryptionService,
    private readonly auditLog: AuditLogService,
    private readonly envService: EnvService,
  ) {}

  private get platformUrl(): string {
    return (
      this.envService.get('PLATFORM_SERVER_URL') ||
      this.envService.get('ANCHOR_PLATFORM_URL') ||
      'http://localhost:8085'
    );
  }

  @Interval(10000)
  async pollPendingTransactions() {
    if (this.isPolling) return;
    this.isPolling = true;

    try {
      const response = await axios.get(
        `${this.platformUrl}/transactions?sep=31&statuses=pending_sender,pending_receiver`,
        {
          timeout: 5000,
        },
      );
      const transactions = response.data.records || [];

      for (const tx of transactions) {
        try {
          await this.processTransaction(tx);
        } catch (txError: any) {
          console.error(
            `[Disbursement Poller] Failed TX ${tx.id}:`,
            txError.message,
          );
          await this.auditLog.log(tx.id, 'poller_error', {
            error: txError.message,
          });

          try {
            await this.sep31Repo
              .createQueryBuilder()
              .update(Sep31TransactionEntity)
              .set({
                status:
                  tx.status === 'pending_receiver'
                    ? 'pending_receiver'
                    : 'pending_sender',
                errorMessage: txError.message,
              })
              .where('id = :id AND status = :status', {
                id: tx.id,
                status: 'processing_lock',
              })
              .execute();
          } catch (e) {}
        }
      }
    } catch (error: any) {
      if (error.code !== 'ECONNREFUSED') {
        console.error('[Disbursement Poller] Poll error:', error.message);
      }
    } finally {
      this.isPolling = false;
    }
  }

  private async processTransaction(tx: any) {
    const txId = tx.id;
    const platformStatus = tx.status;
    const amountIn = this.getAmountIn(tx);

    const lockResult = await this.sep31Repo
      .createQueryBuilder()
      .update(Sep31TransactionEntity)
      .set({ status: 'processing_lock' })
      .where('id = :id AND status IN (:...statuses)', {
        id: txId,
        statuses:
          platformStatus === 'pending_receiver'
            ? ['pending_sender', 'pending_receiver']
            : ['pending_sender'],
      })
      .execute();

    if (lockResult.affected === 0) return;

    console.log(`[Disbursement Poller] Processing TX ${txId}`);

    const txRecord = await this.sep31Repo.findOne({ where: { id: txId } });

    let stellarTxHash = txRecord?.stellarTxHash;
    if (platformStatus !== 'pending_receiver') {
      if (!stellarTxHash && this.shouldAutoMockOnchainPayment()) {
        stellarTxHash = this.buildMockStellarTxHash(txId);
        await this.sep31Repo.update(txId, { stellarTxHash });
        await this.auditLog.log(txId, 'mock_onchain_payment', {
          stellar_tx_hash: stellarTxHash,
        });
      }

      if (!stellarTxHash) {
        await this.sep31Repo.update(txId, { status: 'pending_sender' });
        return;
      }

      await this.anchorRpc.notifyOnchainFundsReceived(
        txId,
        amountIn,
        stellarTxHash,
      );
      await this.sep31Repo.update(txId, { status: 'pending_receiver' });
      await this.auditLog.log(txId, 'onchain_received', {
        stellar_tx_hash: stellarTxHash,
      });
    } else {
      await this.sep31Repo.update(txId, { status: 'pending_receiver' });
      await this.auditLog.log(txId, 'platform_pending_receiver_synced', {
        stellar_tx_hash: stellarTxHash,
      });
    }

    const receiverId = tx.customers?.receiver?.id;
    if (!receiverId) {
      await this.haltForMissingInfo(
        txId,
        'Missing receiver customer ID on transaction',
      );
      return;
    }

    const profile = await this.bankProfileRepo.findOne({
      where: { customerId: receiverId },
    });
    if (!profile) {
      await this.haltForMissingInfo(
        txId,
        `No bank profile for receiver ${receiverId}`,
      );
      return;
    }

    if (!profile.isVerified) {
      await this.haltForMissingInfo(
        txId,
        `Bank profile ${profile.id} not verified`,
      );
      return;
    }

    const bankInfo = {
      account_number: this.encryption.decrypt(profile.encryptedAccount),
      legal_name: this.encryption.decrypt(profile.encryptedName),
      bank_code: profile.bankCode,
    };

    let grossVnd: number;
    const actualQuoteId = tx.quote_id || txRecord?.quoteId;
    if (actualQuoteId) {
      const quote = await this.firmQuoteRepo.findOne({
        where: {
          id: actualQuoteId,
          usedAt: IsNull(),
          expiresAt: MoreThan(new Date()),
        },
      });
      if (!quote) {
        throw new Error(
          `Quote ${actualQuoteId} not found, expired, or already consumed`,
        );
      }
      quote.usedAt = new Date();
      quote.transactionId = txId;
      await this.firmQuoteRepo.save(quote);

      grossVnd = parseInt(quote.buyAmount, 10);
      await this.auditLog.log(txId, 'quote_consumed', {
        quote_id: actualQuoteId,
        gross_vnd: grossVnd,
      });
    } else {
      const oracle = await this.oracleService.getSafeFxRate();
      grossVnd = Math.floor(Number(amountIn) * oracle.rate);
      await this.auditLog.log(txId, 'rate_calculated', {
        rate: oracle.rate,
        method: oracle.method,
        gross_vnd: grossVnd,
      });
    }

    const taxWithheld = Math.floor(grossVnd * 0.1);
    const netVnd = grossVnd - taxWithheld;
    const taxCode = 'PIT-AFFILIATE-10%';
    const complianceMeta = {
      tax_withholding_code: taxCode,
      onshore_contract_ref: `B2B-UNCHAIN-${txId.substring(0, 8)}`,
    };

    console.log(
      `[Disbursement Poller] Disbursing ${netVnd} VND (Tax: ${taxWithheld}) for TX ${txId}`,
    );

    let disburseResult: any;
    try {
      disburseResult = await this.ninePayGateway.disburse(
        netVnd,
        txId,
        bankInfo.bank_code,
        bankInfo.account_number,
        'UCTalent Freelance Disbursement',
        bankInfo.legal_name,
        complianceMeta,
      );

      if (taxWithheld > 0) {
        try {
          const pitBankCode = this.envService.get('PIT_BANK_CODE') || 'BIDV';
          const pitAccountNumber = this.envService.get('PIT_ACCOUNT_NUMBER') || '96311300000170179';
          const pitAccountName = this.envService.get('PIT_ACCOUNT_NAME') || 'UCTALENT PLATFORM';
          
          console.log(`[Disbursement Poller] Disbursing PIT ${taxWithheld} VND to Platform for TX ${txId}`);
          await this.ninePayGateway.disburse(
            taxWithheld,
            `${txId}-PIT`,
            pitBankCode,
            pitAccountNumber,
            'UCTalent PIT Withheld',
            pitAccountName,
            complianceMeta,
          );
        } catch (pitErr: any) {
          console.error(`[Disbursement Poller] PIT Disbursement failed for TX ${txId}:`, pitErr.message);
          await this.auditLog.log(txId, 'pit_disbursement_error', {
            error: pitErr.message,
          });
        }
      }
    } catch (err: any) {
      if (err.message && err.message.includes('RECONCILIATION_FAILED')) {
        await this.sep31Repo.update(txId, {
          status: 'error',
          errorMessage: 'RECONCILIATION_FAILED',
        });
        throw err;
      }
      throw err;
    }

    const napasRef = disburseResult?.refId || disburseResult?.napasRef || `9PAY-${txId}-${Date.now()}`;
    await this.anchorRpc.notifyOffchainFundsPending(txId, napasRef);

    await this.sep31Repo.update(txId, {
      napasRefId: napasRef,
      vndAmount: netVnd,
      withheldTaxAmount: taxWithheld,
      taxCode: taxCode,
      status: 'pending_external',
    });

    await this.auditLog.log(txId, 'napas_sent', {
      napas_ref: napasRef,
      net_vnd: netVnd,
      gross_vnd: grossVnd,
      withheld_tax_amount: taxWithheld,
      tax_code: taxCode,
    });

    console.log(
      `[Disbursement Poller] TX ${txId} → pending_external (awaiting 9Pay IPN)`,
    );

    if (
      this.envService.get('NINEPAY_MODE') === 'mock' ||
      this.envService.get('USE_MOCK_NINEPAY') === 'true' ||
      this.envService.get('USE_MOCK_IPN') === 'true'
    ) {
      await this.ninePayMock.simulateDisbursement(
        txId,
        netVnd,
        txId,
        napasRef,
      );
      if (taxWithheld > 0) {
        await this.ninePayMock.simulateDisbursement(
          `${txId}-PIT`,
          taxWithheld,
          `${txId}-PIT`,
          napasRef,
        );
      }
    }
  }

  private async haltForMissingInfo(txId: string, reason: string) {
    console.warn(`[Disbursement Poller] HALT TX ${txId}: ${reason}`);
    await this.sep31Repo.update(txId, {
      status: 'pending_customer_info_update',
      errorMessage: reason,
    });
    await this.auditLog.log(txId, 'halted_missing_info', { reason });
  }

  private getAmountIn(tx: any): string {
    if (typeof tx.amount_in === 'string') return tx.amount_in;
    if (typeof tx.amount_in?.amount === 'string') return tx.amount_in.amount;
    if (tx.amount_expected?.amount) return tx.amount_expected.amount;
    return '0';
  }

  private shouldAutoMockOnchainPayment(): boolean {
    return (
      this.envService.get('NODE_ENV') !== 'production' &&
      (this.envService.get('NINEPAY_MODE') === 'mock' ||
        this.envService.get('USE_MOCK_NINEPAY') === 'true' ||
        this.envService.get('USE_MOCK_IPN') === 'true')
    );
  }

  private buildMockStellarTxHash(txId: string): string {
    const txSuffix = txId.replace(/-/g, '').slice(0, 16);
    return `mock-stellar-${txSuffix}-${Date.now()}`;
  }
}
