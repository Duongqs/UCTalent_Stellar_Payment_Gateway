import axios from 'axios';
import { AnchorRpcService } from './anchor-rpc.service';
import { NinePayGatewayService } from './ninepay-gateway.service';
import { NinePayMockService } from './ninepay-mock.service';
import { BankProfileModel } from '../models/bank-profile.model';
import { getSafeFxRate } from './oracle.service';
import { query, auditLog } from '../db';
import { decrypt } from './encryption.service';

export class Sep31PollerService {
  private static platformUrl = process.env.PLATFORM_SERVER_URL || 'http://localhost:8085';
  private static intervalId: NodeJS.Timeout;

  static startPolling() {
    console.log('[SEP31 Poller] Starting — polling every 10 seconds');
    this.intervalId = setInterval(async () => {
      await this.pollPendingTransactions();
    }, 10000);
  }

  static stopPolling() {
    if (this.intervalId) clearInterval(this.intervalId);
  }

  private static async pollPendingTransactions() {
    try {
      const response = await axios.get(`${this.platformUrl}/transactions?sep=31&statuses=pending_sender`, {
        timeout: 5000,
      });
      const transactions = response.data.records || [];

      for (const tx of transactions) {
        try {
          await this.processTransaction(tx);
        } catch (txError: any) {
          console.error(`[SEP31 Poller] Failed TX ${tx.id}:`, txError.message);
          await auditLog(tx.id, 'poller_error', { error: txError.message });
          
          // Reset lock so the next cycle can retry this transaction if it failed before progressing to pending_receiver
          await query(
            `UPDATE sep31_transactions 
             SET status = 'pending_sender', error_message = $2, updated_at = now() 
             WHERE id = $1 AND status = 'processing_lock'`,
            [tx.id, txError.message]
          ).catch(() => {});
        }
      }
    } catch (error: any) {
      // Silently skip if Anchor Platform is offline (common in dev)
      if (error.code !== 'ECONNREFUSED') {
        console.error('[SEP31 Poller] Poll error:', error.message);
      }
    }
  }

  private static async processTransaction(tx: any) {
    const txId = tx.id;

    // ── Idempotency: check if we already started processing this tx ──
    const lockResult = await query(
      `UPDATE sep31_transactions 
       SET status = 'processing_lock', updated_at = now()
       WHERE id = $1 AND status = 'pending_sender'
       RETURNING id`,
      [txId]
    );
    if (!lockResult) return; // Worker khác đã lock

    console.log(`[SEP31 Poller] Processing TX ${txId}`);

    // ── Step 1: Get real Stellar TX hash ──
    // In production, Bridge Listener writes the hash to sep31_transactions
    // when it detects the on-chain payment via Horizon streaming.
    const txRecord = await query<{ stellar_tx_hash: string | null }>(
      'SELECT stellar_tx_hash FROM sep31_transactions WHERE id = $1',
      [txId]
    );

    const stellarTxHash = txRecord?.stellar_tx_hash;
    if (!stellarTxHash) {
      await query("UPDATE sep31_transactions SET status = 'pending_sender' WHERE id = $1", [txId]);
      return; // Chờ Bridge Listener populate
    }

    await AnchorRpcService.notifyOnchainFundsReceived(txId, tx.amount_in, stellarTxHash);
    await query(
      `UPDATE sep31_transactions SET status = 'pending_receiver', updated_at = now() WHERE id = $1`,
      [txId]
    );
    await auditLog(txId, 'onchain_received', { stellar_tx_hash: stellarTxHash });

    // ── Step 2: Hydrate bank info (NO hardcoded fallbacks) ──
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

    // Decrypt sensitive data — exists only in memory during this function call
    const bankInfo = {
      account_number: decrypt(profile.encrypted_account),
      legal_name: decrypt(profile.encrypted_name),
      bank_code: profile.bank_code,
    };

    // ── Step 3: Resolve VND amount ──
    let vndAmount: number;
    if (tx.quote_id) {
      // Atomic consume: marks quote as used in single query (prevents double-use)
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
      // No quote — use live oracle rate (throws if circuit breaker open)
      const oracle = await getSafeFxRate();
      vndAmount = Math.floor(Number(tx.amount_in) * oracle.rate);
      await auditLog(txId, 'rate_calculated', { rate: oracle.rate, method: oracle.method, vnd_amount: vndAmount });
    }

    // ── Step 4: Disburse via 9Pay/NAPAS with PIT Withholding ──
    const taxWithheld = Math.floor(vndAmount * 0.1); // 10% PIT
    const finalVndAmount = vndAmount - taxWithheld;
    const taxCode = 'PIT-AFFILIATE-10%';
    const complianceMeta = {
      tax_withholding_code: taxCode,
      onshore_contract_ref: `B2B-UNCHAIN-${txId.substring(0, 8)}`
    };

    console.log(`[SEP31 Poller] Disbursing ${finalVndAmount} VND (Tax withheld: ${taxWithheld}) for TX ${txId}`);

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

    console.log(`[SEP31 Poller] TX ${txId} → pending_external (awaiting 9Pay IPN)`);
    
    if (process.env.USE_MOCK_IPN === 'true') {
      NinePayMockService.simulateDisbursement(txId, finalVndAmount, txId, napasRef);
    }
    
    // bankInfo goes out of scope here — sensitive data not persisted unencrypted
  }

  /**
   * HALT transaction when required info is missing. No hardcoded fallback values.
   */
  private static async haltForMissingInfo(txId: string, reason: string) {
    console.warn(`[SEP31 Poller] HALT TX ${txId}: ${reason}`);
    await query(
      `UPDATE sep31_transactions SET status = 'pending_customer_info_update', error_message = $2, updated_at = now() WHERE id = $1`,
      [txId, reason]
    );
    await auditLog(txId, 'halted_missing_info', { reason });
  }
}
