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

    let vndAmount = tx.vndAmount ? Number(tx.vndAmount) : 0;
    if (!vndAmount || vndAmount === 0) {
      const oracle = await this.oracleService.getSafeFxRate();
      vndAmount = Math.floor(Number(tx.amountIn) * oracle.rate);
    }

    // Apply PIT Tax calculation (10%)
    const taxWithheld = Math.floor(vndAmount * 0.1);
    const finalVndAmount = vndAmount - taxWithheld;
    const taxCode = 'PIT-AFFILIATE-10%';
    const complianceMeta = {
      tax_withholding_code: taxCode,
      onshore_contract_ref: `B2B-UNCHAIN-${txId.substring(0, 8)}`,
    };

    console.log(
      `[Pending Clearing Processor] Disbursing ${finalVndAmount} VND (Tax: ${taxWithheld}) for TX ${txId}`,
    );

    try {
      await this.ninePayGateway.disburse(
        finalVndAmount,
        txId,
        bankInfo.bank_code,
        bankInfo.account_number,
        'UCTalent Freelance Disbursement',
        bankInfo.legal_name,
        complianceMeta,
      );
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

    const napasRef = tx.napasRefId || `9payclr${txId.substring(5, 17).toUpperCase()}`;

    // Only call notifyOffchainFundsPending if NOT an off-platform transaction (ucttx)
    if (!txId.startsWith('ucttx')) {
      await this.anchorRpc.notifyOffchainFundsPending(txId, napasRef);
    }

    await this.sep31Repo.update(txId, {
      napasRefId: napasRef,
      vndAmount: finalVndAmount,
      withheldTaxAmount: taxWithheld,
      taxCode: taxCode,
      status: 'pending_external',
    });

    await this.auditLog.log(txId, 'napas_sent', {
      napas_ref: napasRef,
      vnd_amount: finalVndAmount,
      withheld_tax_amount: taxWithheld,
      tax_code: taxCode,
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
        finalVndAmount,
        txId,
        napasRef,
      );
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
