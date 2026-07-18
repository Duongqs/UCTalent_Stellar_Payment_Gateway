import { Injectable } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Sep31TransactionEntity,
  BankProfileEntity,
  EnvService,
  EncryptionService,
  AuditLogService,
  CustomerService,
} from '@uc/core';
import { AnchorRpcService } from '@uc/stellar';
import {
  NinePayGatewayService,
  NinePayMockService,
  OracleService,
} from '@uc/banking';

@Injectable()
export class PendingClearingProcessorService {
  private isProcessing = false;

  constructor(
    @InjectRepository(Sep31TransactionEntity)
    private readonly sep31Repo: Repository<Sep31TransactionEntity>,
    @InjectRepository(BankProfileEntity)
    private readonly bankProfileRepo: Repository<BankProfileEntity>,
    private readonly anchorRpc: AnchorRpcService,
    private readonly ninePayGateway: NinePayGatewayService,
    private readonly ninePayMock: NinePayMockService,
    private readonly oracleService: OracleService,
    private readonly encryption: EncryptionService,
    private readonly auditLog: AuditLogService,
    private readonly envService: EnvService,
    private readonly customerService: CustomerService,
  ) {}

  @Interval(10000)
  async processPendingClearing() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      // Find transactions with status 'pending_clearing'
      const pendingTxs = await this.sep31Repo.find({
        where: { status: 'pending_clearing' },
        take: 10,
      });

      for (const tx of pendingTxs) {
        try {
          await this.processSingleTransaction(tx);
        } catch (err: any) {
          console.error(
            `[Pending Clearing Processor] Failed processing TX ${tx.id}:`,
            err.message,
          );
          await this.auditLog.log(tx.id, 'clearing_processor_error', {
            error: err.message,
          });

          // Reset status back to pending_clearing so it can be retried, unless it's a final error
          try {
            await this.sep31Repo
              .createQueryBuilder()
              .update(Sep31TransactionEntity)
              .set({ status: 'pending_clearing', errorMessage: err.message })
              .where('id = :id AND status = :status', {
                id: tx.id,
                status: 'processing_lock',
              })
              .execute();
          } catch (e) {}
        }
      }
    } catch (error: any) {
      console.error(
        '[Pending Clearing Processor] General process error:',
        error.message,
      );
    } finally {
      this.isProcessing = false;
    }
  }

  private async processSingleTransaction(tx: Sep31TransactionEntity) {
    const txId = tx.id;

    // Acquire lock
    const lockResult = await this.sep31Repo
      .createQueryBuilder()
      .update(Sep31TransactionEntity)
      .set({ status: 'processing_lock' })
      .where('id = :id AND status = :status', {
        id: txId,
        status: 'pending_clearing',
      })
      .execute();

    if (lockResult.affected === 0) return;

    console.log(`[Pending Clearing Processor] Processing TX ${txId}`);

    const receiverId = tx.receiverId;
    if (!receiverId || receiverId === 'SYSTEM') {
      await this.haltForMissingInfo(
        txId,
        'Missing receiver customer ID on transaction',
      );
      return;
    }

    const profile = await this.bankProfileRepo.findOne({
      where: { customerId: receiverId },
      order: { createdAt: 'DESC' },
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

    let grossVnd = tx.vndAmount ? Number(tx.vndAmount) : 0;
    let effectiveExchangeRate: number | undefined;
    if (!grossVnd || grossVnd === 0) {
      const oracle = await this.oracleService.getSafeFxRate();
      effectiveExchangeRate = oracle.rate;
      grossVnd = Math.floor(Number(tx.amountIn) * effectiveExchangeRate);
    } else {
      const amountIn = Number(tx.amountIn);
      if (amountIn > 0) {
        effectiveExchangeRate = grossVnd / amountIn;
      }
    }

    // Apply PIT Tax calculation (10%)
    const taxWithheld = Math.floor(grossVnd * 0.1);
    const netVnd = grossVnd - taxWithheld;
    const taxCode = 'PIT-AFFILIATE-10%';
    const complianceMeta = {
      tax_withholding_code: taxCode,
      onshore_contract_ref: `B2B-UNCHAIN-${txId.substring(0, 8)}`,
    };

    console.log(
      `[Pending Clearing Processor] Disbursing ${netVnd} VND (Tax: ${taxWithheld}) for TX ${txId}`,
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
          
          console.log(`[Pending Clearing Processor] Disbursing PIT ${taxWithheld} VND to Platform for TX ${txId}`);
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
          console.error(`[Pending Clearing Processor] PIT Disbursement failed for TX ${txId}:`, pitErr.message);
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

    const napasRef = disburseResult?.refId || disburseResult?.napasRef || tx.napasRefId || `9PAY-${txId}-${Date.now()}`;

    // Only call notifyOffchainFundsPending if NOT an off-platform transaction (ucttx)
    if (!txId.startsWith('ucttx')) {
      await this.anchorRpc.notifyOffchainFundsPending(txId, napasRef);
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
      exchange_rate: effectiveExchangeRate,
    });

    console.log(
      `[Pending Clearing Processor] TX ${txId} → pending_external (awaiting 9Pay IPN)`,
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
    console.warn(`[Pending Clearing Processor] HALT TX ${txId}: ${reason}`);
    await this.sep31Repo.update(txId, {
      status: 'pending_customer_info_update',
      errorMessage: reason,
    });
    await this.auditLog.log(txId, 'halted_missing_info', { reason });
  }
}
