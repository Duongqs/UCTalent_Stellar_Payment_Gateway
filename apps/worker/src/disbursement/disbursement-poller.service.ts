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
import * as crypto from 'crypto';

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

  private getBackendRevertUrl(): string {
    let backendUrl = this.envService.get('UCTALENT_BACKEND_WEBHOOK_URL');
    if (backendUrl) {
      if (backendUrl.includes('settlement-callback')) {
        backendUrl = backendUrl.replace('settlement-callback', 'revert-disbursement');
      } else if (backendUrl.includes('/cross-border/')) {
        backendUrl = backendUrl.replace(/\/cross-border\/.*$/, '/cross-border/revert-disbursement');
      } else {
        backendUrl = backendUrl.replace(/\/api\/.*$/, '/api/cross-border/revert-disbursement');
      }
    }
    return backendUrl || 'http://localhost:3000/api/cross-border/revert-disbursement';
  }

  private async revertPaymentDistribution(distributionId: string): Promise<void> {
    if (!distributionId) return;

    const url = this.getBackendRevertUrl();
    const payload = { distributionId };
    const payloadString = JSON.stringify(payload);
    const secret = this.envService.get('CROSS_BORDER_WEBHOOK_SECRET');
    if (!secret) throw new Error('CROSS_BORDER_WEBHOOK_SECRET is not configured');
    const signature = 'sha256=' + crypto.createHmac('sha256', secret).update(payloadString).digest('hex');

    try {
      const res = await axios.post(url, payload, {
        headers: {
          'Content-Type': 'application/json',
          'X-UCTALENT-SIGNATURE': signature,
        },
        timeout: 5000,
      });
      console.log(
        `[Disbursement Poller] Reverted payment distribution ${distributionId} to claimable: ${res.status}`
      );
    } catch (err: any) {
      console.warn(
        `[Disbursement Poller] Failed to revert payment distribution ${distributionId}: ${err.message}`
      );
    }
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

          const isPermanentError = txError.message?.includes('9Pay Disbursement Failed') || txError.message?.includes('RECONCILIATION_FAILED') || txError.message?.includes('expired');

          try {
            await this.sep31Repo
              .createQueryBuilder()
              .update(Sep31TransactionEntity)
              .set({
                status: isPermanentError
                  ? 'error'
                  : tx.status === 'pending_receiver'
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

          if (isPermanentError) {
             try {
               await this.anchorRpc.notifyTransactionError(tx.id, txError.message);
             } catch(rpcErr: any) {
               console.error(`[Disbursement Poller] Failed to notify anchor of error:`, rpcErr.message);
             }
          }

          try {
            const txRecord = await this.sep31Repo.findOne({
              where: { id: tx.id },
            });
            if (txRecord?.distributionId) {
              await this.revertPaymentDistribution(txRecord.distributionId);
            }
          } catch (revertErr: any) {
            console.warn(
              `[Disbursement Poller] Could not lookup/revert distribution for TX ${tx.id}: ${revertErr.message}`
            );
          }
        }
      }
    } catch (error: any) {
      if (
        (error.code === 'ECONNREFUSED' || (error.message && error.message.includes('ECONNREFUSED'))) &&
        this.envService.get('USE_MOCK_IPN') === 'true'
      ) {
        console.warn(`[Mock] Anchor Platform down. Simulating polling for mock transactions.`);
        try {
          const localTxs = await this.sep31Repo.find({ where: { status: 'pending_sender' } });
          for (const tx of localTxs) {
            try {
              await this.processTransaction({
                id: tx.id,
                status: 'pending_receiver',
                amount_in: { amount: tx.amountIn || '0' },
                customers: {
                  receiver: { id: tx.receiverId },
                },
              });
            } catch (mockErr: any) {
              console.error(`[Mock Poller] Failed TX ${tx.id}:`, mockErr.message);
            }
          }
        } catch (dbErr: any) {
          console.error(`[Mock Poller] DB Error:`, dbErr.message);
        }
      } else if (error.code !== 'ECONNREFUSED') {
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

    if (lockResult.affected === 0) {
      // console.debug(`[Disbursement Poller] Skipping TX ${txId} (already locked or processed)`);
      return;
    }

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

      try {
        await this.anchorRpc.notifyOnchainFundsReceived(
          txId,
          amountIn,
          stellarTxHash,
        );
      } catch (rpcErr: any) {
        if (this.envService.get('USE_MOCK_IPN') === 'true') {
          console.warn(`[Mock] Ignored Anchor RPC error for TX ${txId}: ${rpcErr.message}`);
        } else {
          throw rpcErr;
        }
      }
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
    console.log(`[Disbursement Poller] Profile for ${receiverId}:`, !!profile);
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
    let effectiveExchangeRate: number | undefined;
    const actualQuoteId = tx.quote_id || txRecord?.quoteId;
    if (actualQuoteId) {
      const quote = await this.firmQuoteRepo.findOne({
        where: { id: actualQuoteId },
      });
      if (!quote) {
        throw new Error(`Quote ${actualQuoteId} not found`);
      }

      if (quote.usedAt && quote.transactionId === txId) {
        // Already consumed by this transaction in a previous try, allow proceeding
        grossVnd = parseInt(quote.buyAmount, 10);
      } else if (quote.usedAt) {
        throw new Error(`Quote ${actualQuoteId} already consumed by another transaction`);
      } else if (quote.expiresAt && new Date(quote.expiresAt).getTime() < Date.now()) {
        throw new Error(`Quote ${actualQuoteId} expired`);
      } else {
        quote.usedAt = new Date();
        quote.transactionId = txId;
        await this.firmQuoteRepo.save(quote);

        grossVnd = parseInt(quote.buyAmount, 10);
        await this.auditLog.log(txId, 'quote_consumed', {
          quote_id: actualQuoteId,
          gross_vnd: grossVnd,
        });
      }
      
      const amountInNum = Number(amountIn);
      if (amountInNum > 0) {
        effectiveExchangeRate = grossVnd / amountInNum;
      }
    } else {
      const oracle = await this.oracleService.getSafeFxRate();
      grossVnd = Math.floor(Number(amountIn) * oracle.rate);
      effectiveExchangeRate = oracle.rate;
      await this.auditLog.log(txId, 'rate_calculated', {
        rate: oracle.rate,
        method: oracle.method,
        gross_vnd: grossVnd,
      });
    }

    const PIT_THRESHOLD_VND = Number(this.envService.get('PIT_THRESHOLD_VND' as any) || 2000000);
    const taxWithheld = grossVnd >= PIT_THRESHOLD_VND ? Math.floor(grossVnd * 0.1) : 0;
    const netVnd = grossVnd - taxWithheld;
    const taxCode = taxWithheld > 0 ? 'PIT-AFFILIATE-10%' : undefined;
    const complianceMeta: Record<string, string> = {
      onshore_contract_ref: `B2B-UNCHAIN-${txId.substring(0, 8)}`,
    };
    if (taxCode) {
      complianceMeta.tax_withholding_code = taxCode;
    }

    console.log(
      `[Disbursement Poller] Disbursing ${netVnd} VND (Tax: ${taxWithheld}) for TX ${txId}`,
    );

    let description = 'UCTalent Freelance Disbursement';
    if (txRecord?.jobName) {
      if (txRecord.paymentType === 'escrow_release' || txRecord.paymentType === 'milestone_release') {
        description = `UCTalent thanh toan chi phi cong viec ${txRecord.jobName}`;
        if (txRecord.milestoneIndex != null) {
           description += ` (Milestone ${txRecord.milestoneIndex + 1})`;
        }
      } else if (txRecord.paymentType === 'referral_success') {
        description = `UCTalent thanh toan hoa hong gioi thieu job ${txRecord.jobName}`;
      } else {
        description = `UCTalent thanh toan job ${txRecord.jobName}`;
      }
    }

    let disburseResult: any;
    try {
      console.log(`[Disbursement Poller] Calling ninePayGateway.disburse...`);
      disburseResult = await this.ninePayGateway.disburse(
        netVnd,
        txId,
        bankInfo.bank_code,
        bankInfo.account_number,
        description,
        bankInfo.legal_name,
        complianceMeta,
      );

      if (taxWithheld > 0) {
        try {
          const pitBankCode = this.envService.get('PIT_BANK_CODE');
          if (!pitBankCode) throw new Error('PIT_BANK_CODE is not configured');
          const pitAccountNumber = this.envService.get('PIT_ACCOUNT_NUMBER');
          if (!pitAccountNumber) throw new Error('PIT_ACCOUNT_NUMBER is not configured');
          const pitAccountName = this.envService.get('PIT_ACCOUNT_NAME');
          if (!pitAccountName) throw new Error('PIT_ACCOUNT_NAME is not configured');
          
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

    const napasRef = disburseResult?.paymentNo
      || (disburseResult?.payment_no ? String(disburseResult.payment_no) : undefined)
      || (() => {
        const fallback = `9PAY-FALLBACK-${txId.substring(0, 8)}-${Date.now()}`;
        console.warn(`[Disbursement Poller] WARNING: No payment_no from 9Pay for TX ${txId}. Using fallback: ${fallback}`);
        return fallback;
      })();
    try {
      await this.anchorRpc.notifyOffchainFundsPending(txId, napasRef);
    } catch (rpcErr: any) {
      if (this.envService.get('USE_MOCK_IPN') === 'true') {
        console.warn(`[Mock] Ignored Anchor RPC error for TX ${txId}: ${rpcErr.message}`);
      } else {
        throw rpcErr;
      }
    }

    await this.sep31Repo.update(txId, {
      napasRefId: napasRef,
      vndAmount: netVnd,
      withheldTaxAmount: taxWithheld,
      taxCode: taxCode,
      status: 'pending_external',
      ...(effectiveExchangeRate != null && { exchangeRate: effectiveExchangeRate }),
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
