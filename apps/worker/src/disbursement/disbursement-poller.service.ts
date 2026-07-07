import { Injectable } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { AnchorRpcService } from '@uc/stellar';
import { NinePayGatewayService, NinePayMockService, getSafeFxRate } from '@uc/banking';
import { BankProfileModel, query, auditLog, decrypt } from '@uc/core';
import axios from 'axios';

@Injectable()
export class DisbursementPollerService {
  private platformUrl = process.env.ANCHOR_PLATFORM_URL || process.env.PLATFORM_SERVER_URL || 'http://localhost:8085';
  private isPolling = false;

  @Interval(10000)
  async pollPendingTransactions() {
    if (this.isPolling) return;
    this.isPolling = true;

    try {
      const response = await axios.get(`${this.platformUrl}/transactions?sep=31&statuses=pending_sender`, {
        timeout: 5000,
      });
      const transactions = response.data.records || [];

      for (const tx of transactions) {
        try {
          await this.processTransaction(tx);
        } catch (txError: any) {
          console.error(`[Disbursement Poller] Failed TX ${tx.id}:`, txError.message);
          await auditLog(tx.id, 'poller_error', { error: txError.message });
          
          // Reset lock if it fails before progressing to pending_receiver
          await query(
            `UPDATE sep31_transactions 
             SET status = 'pending_sender', error_message = $2, updated_at = now() 
             WHERE id = $1 AND status = 'processing_lock'`,
            [tx.id, txError.message]
          ).catch(() => {});
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

    // Acquire lock
    const lockResult = await query(
      `UPDATE sep31_transactions 
       SET status = 'processing_lock', updated_at = now()
       WHERE id = $1 AND status = 'pending_sender'
       RETURNING id`,
      [txId]
    );
    if (!lockResult) return; // Locked by another worker instance

    console.log(`[Disbursement Poller] Processing TX ${txId}`);

    // Get Stellar TX Hash
    const txRecord = await query<{ stellar_tx_hash: string | null }>(
      'SELECT stellar_tx_hash FROM sep31_transactions WHERE id = $1',
      [txId]
    );

    const stellarTxHash = txRecord?.stellar_tx_hash;
    if (!stellarTxHash) {
      // Revert status to wait for Bridge Listener or manual tx hash population
      await query("UPDATE sep31_transactions SET status = 'pending_sender' WHERE id = $1", [txId]);
      return; 
    }

    await AnchorRpcService.notifyOnchainFundsReceived(txId, tx.amount_in, stellarTxHash);
    await query(
      `UPDATE sep31_transactions SET status = 'pending_receiver', updated_at = now() WHERE id = $1`,
      [txId]
    );
    await auditLog(txId, 'onchain_received', { stellar_tx_hash: stellarTxHash });

    // Resolve receiver
    const receiverId = tx.customers?.receiver?.id;
    if (!receiverId) {
      await this.haltForMissingInfo(txId, 'Missing receiver customer ID on transaction');
      return;
    }

    const profile = await BankProfileModel.findByCustomerId(receiverId);
    if (!profile) {
      await this.haltForMissingInfo(txId, `No bank profile for receiver ${receiverId}`);
      return;
    }

    if (!profile.is_verified) {
      await this.haltForMissingInfo(txId, `Bank profile ${profile.id} not verified`);
      return;
    }

    // Decrypt bank information
    const bankInfo = {
      account_number: decrypt(profile.encrypted_account),
      legal_name: decrypt(profile.encrypted_name),
      bank_code: profile.bank_code,
    };

    // Calculate VND amount
    let vndAmount: number;
    if (tx.quote_id) {
      const quote = await query<{ buy_amount: string; sell_amount: string; expires_at: string }>(
        `UPDATE firm_quotes SET used_at = now(), transaction_id = $2
         WHERE id = $1 AND used_at IS NULL AND expires_at > now()
         RETURNING *`,
        [tx.quote_id, txId]
      );
      if (!quote) {
        throw new Error(`Quote ${tx.quote_id} not found, expired, or already consumed`);
      }
      vndAmount = parseInt(quote.buy_amount);
      await auditLog(txId, 'quote_consumed', { quote_id: tx.quote_id, vnd_amount: vndAmount });
    } else {
      const oracle = await getSafeFxRate();
      vndAmount = Math.floor(Number(tx.amount_in) * oracle.rate);
      await auditLog(txId, 'rate_calculated', { rate: oracle.rate, method: oracle.method, vnd_amount: vndAmount });
    }

    // Apply 10% PIT withholding tax
    const taxWithheld = Math.floor(vndAmount * 0.1);
    const finalVndAmount = vndAmount - taxWithheld;
    const taxCode = 'PIT-AFFILIATE-10%';
    const complianceMeta = {
      tax_withholding_code: taxCode,
      onshore_contract_ref: `B2B-UNCHAIN-${txId.substring(0, 8)}`
    };

    console.log(`[Disbursement Poller] Disbursing ${finalVndAmount} VND (Tax: ${taxWithheld}) for TX ${txId}`);

    try {
      await NinePayGatewayService.disburse(
        finalVndAmount,
        txId,
        bankInfo.bank_code,
        bankInfo.account_number,
        'UCTalent Freelance Disbursement',
        bankInfo.legal_name,
        complianceMeta
      );
    } catch (err: any) {
      if (err.message && err.message.includes('RECONCILIATION_FAILED')) {
        await query(
          `UPDATE sep31_transactions SET status = 'error', error_message = $2, updated_at = now() WHERE id = $1`,
          [txId, 'RECONCILIATION_FAILED']
        );
        throw err;
      }
      throw err;
    }

    const napasRef = `NAPAS-${Date.now()}`;
    await AnchorRpcService.notifyOffchainFundsPending(txId, napasRef);
    await query(
      `UPDATE sep31_transactions 
       SET napas_ref_id = $2, vnd_amount = $3, withheld_tax_amount = $4, tax_code = $5, status = 'pending_external', updated_at = now() 
       WHERE id = $1`,
      [txId, napasRef, finalVndAmount, taxWithheld, taxCode]
    );
    await auditLog(txId, 'napas_sent', { napas_ref: napasRef, vnd_amount: finalVndAmount, withheld_tax_amount: taxWithheld, tax_code: taxCode });

    console.log(`[Disbursement Poller] TX ${txId} → pending_external (awaiting 9Pay IPN)`);
    
    if (process.env.NINEPAY_MODE === 'mock' || process.env.USE_MOCK_NINEPAY === 'true' || process.env.USE_MOCK_IPN === 'true') {
      await NinePayMockService.simulateDisbursement(txId, finalVndAmount, txId, napasRef);
    }
  }

  private async haltForMissingInfo(txId: string, reason: string) {
    console.warn(`[Disbursement Poller] HALT TX ${txId}: ${reason}`);
    await query(
      `UPDATE sep31_transactions SET status = 'pending_customer_info_update', error_message = $2, updated_at = now() WHERE id = $1`,
      [txId, reason]
    );
    await auditLog(txId, 'halted_missing_info', { reason });
  }
}
