import request from 'supertest';
import express from 'express';
import { Sep31Controller } from '../src/callbacks/sep31.controller';
import { Sep31PollerService } from '../src/services/sep31-poller.service';
import { IpnController } from '../src/callbacks/ipn.controller';
import { Sep31TransactionService } from '../src/services/sep31-transaction.service';
import { AnchorRpcService } from '../src/services/anchor-rpc.service';
import { NinePayGatewayService } from '../src/services/ninepay-gateway.service';
import { BankProfileModel } from '../src/models/bank-profile.model';
import { getSafeFxRate } from '../src/services/oracle.service';
import { decrypt } from '../src/services/encryption.service';
import * as db from '../src/db';
import axios from 'axios';
import crypto from 'crypto';

function mockIpnBody(payload: any) {
  const resultB64 = Buffer.from(JSON.stringify(payload)).toString('base64');
  const checksum = crypto
    .createHash('sha256')
    .update(resultB64 + (process.env.NINEPAY_CHECKSUM_KEY || ''))
    .digest('hex')
    .toUpperCase();
  return { result: resultB64, checksum };
}
jest.mock('uuid', () => ({ v4: () => 'mock-uuid-123' }));
jest.mock('../src/services/sep31-transaction.service');
jest.mock('../src/services/anchor-rpc.service');
jest.mock('../src/services/ninepay-gateway.service');
jest.mock('../src/models/bank-profile.model');
jest.mock('../src/services/oracle.service');
jest.mock('../src/services/encryption.service');
jest.mock('../src/db');
jest.mock('axios');

const app = express();
app.use(express.json());
app.post('/sep31/initiate', Sep31Controller.initiateDisbursement);
app.post('/ipn', IpnController.handleIpn);

describe('SEP-31 Full Flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Transaction Creation ─────────────────────────────────────────────

  describe('POST /sep31/initiate', () => {
    it('creates with valid inputs', async () => {
      (Sep31TransactionService.createTransaction as jest.Mock).mockResolvedValue({
        id: 'tx-123',
        stellar_account: 'GABC',
        stellar_memo: 'memo123',
        stellar_memo_type: 'text'
      });

      const res = await request(app).post('/sep31/initiate')
        .send({ amount: '10', asset_code: 'USDC',
                sender_id: 'sender-1', receiver_id: 'receiver-1',
                quote_id: 'quote-1' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.transactionId).toBe('tx-123');
      expect(Sep31TransactionService.createTransaction).toHaveBeenCalledWith({
        amount: '10',
        asset_code: 'USDC',
        sender_id: 'sender-1',
        receiver_id: 'receiver-1',
        quote_id: 'quote-1',
      });
      expect(db.query).toHaveBeenCalled(); // Verify DB insert was called
    });

    it('rejects if missing required fields', async () => {
      const res = await request(app).post('/sep31/initiate')
        .send({ amount: '10', sender_id: 'sender-1' }); // missing receiver_id

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Missing required fields');
    });

    it('rejects if receiver KYC is NEEDS_INFO', async () => {
      (Sep31TransactionService.createTransaction as jest.Mock)
        .mockRejectedValue(new Error('CUSTOMER_NEEDS_INFO: receiver-1 has not completed KYC'));

      const res = await request(app).post('/sep31/initiate')
        .send({ amount: '10', asset_code: 'USDC',
                sender_id: 'sender-1', receiver_id: 'receiver-1' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('customer_info_needed');
    });

    it('rejects if firm quote is expired', async () => {
      (Sep31TransactionService.createTransaction as jest.Mock)
        .mockRejectedValue(new Error('QUOTE_EXPIRED: quote-old expired'));

      const res = await request(app).post('/sep31/initiate')
        .send({ amount: '10', asset_code: 'USDC',
                sender_id: 'sender-1', receiver_id: 'receiver-1',
                quote_id: 'quote-old' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('quote_expired');
    });
  });

  // ── Poller ───────────────────────────────────────────────────────────

  describe('Poller processing', () => {
    let mockTx: any;

    beforeEach(() => {
      mockTx = {
        id: 'tx-456',
        amount_in: '10',
        quote_id: 'quote-456',
        customers: { receiver: { id: 'receiver-1' } }
      };
      
      // Setup default successful path mocks
      (db.query as jest.Mock).mockImplementation(async (sql: string, params: any[]) => {
        if (sql.includes('processing_lock')) {
          return { id: 'tx-456' };
        }
        if (sql.includes('SELECT stellar_tx_hash')) {
          return { stellar_tx_hash: 'real-hash-abc' };
        }
        if (sql.includes('UPDATE firm_quotes')) {
          return { buy_amount: '254000', sell_amount: '10', expires_at: new Date(Date.now() + 10000).toISOString() };
        }
        return null; // for updates/inserts
      });

      (BankProfileModel.findByCustomerId as jest.Mock).mockResolvedValue({
        id: 'profile-1',
        is_verified: true,
        encrypted_account: 'enc-acc',
        encrypted_name: 'enc-name',
        bank_code: '970436'
      });

      (decrypt as jest.Mock).mockImplementation((val) => {
        if (val === 'enc-acc') return '9876543210';
        if (val === 'enc-name') return 'NGUYEN VAN A';
        return val;
      });

      (axios.get as jest.Mock).mockResolvedValue({ data: { records: [mockTx] } });
      (NinePayGatewayService.disburse as jest.Mock).mockResolvedValue({ success: true });
    });

    it('calls notifyOnchainFundsReceived for pending_sender tx', async () => {
      // @ts-ignore - access private method for testing
      await Sep31PollerService.processTransaction(mockTx);

      expect(AnchorRpcService.notifyOnchainFundsReceived).toHaveBeenCalledWith(
        'tx-456', '10', 'real-hash-abc'
      );
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining("status = 'pending_receiver'"),
        ['tx-456']
      );
      expect(db.auditLog).toHaveBeenCalledWith('tx-456', 'onchain_received', { stellar_tx_hash: 'real-hash-abc' });
    });

    it('skips transactions already progressed past pending_sender', async () => {
      (db.query as jest.Mock).mockImplementation(async (sql: string) => {
        if (sql.includes('processing_lock')) {
          return null;
        }
        return null;
      });

      // @ts-ignore
      await Sep31PollerService.processTransaction(mockTx);

      expect(AnchorRpcService.notifyOnchainFundsReceived).not.toHaveBeenCalled();
      expect(BankProfileModel.findByCustomerId).not.toHaveBeenCalled();
      expect(NinePayGatewayService.disburse).not.toHaveBeenCalled();
    });

    it('converts USDC to VND using firm quote buy_amount', async () => {
      // @ts-ignore
      await Sep31PollerService.processTransaction(mockTx);

      // 254000 - 10% PIT (25400) = 228600
      expect(NinePayGatewayService.disburse).toHaveBeenCalledWith(
        228600,
        'tx-456',
        '970436',
        '9876543210',
        expect.any(String),
        'NGUYEN VAN A',
        expect.any(Object)
      );
    });

    it('converts USDC to VND via spot rate when no quote_id', async () => {
      mockTx.quote_id = undefined;
      (getSafeFxRate as jest.Mock).mockResolvedValue({ rate: 25400, method: 'median' });

      // @ts-ignore
      await Sep31PollerService.processTransaction(mockTx);

      // 10 * 25400 = 254000 -> 10% tax = 25400 -> 228600
      expect(NinePayGatewayService.disburse).toHaveBeenCalledWith(
        228600,
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(Object)
      );
    });

    it('halts if bank profile not verified', async () => {
      (BankProfileModel.findByCustomerId as jest.Mock).mockResolvedValue({
        id: 'profile-1',
        is_verified: false
      });

      // @ts-ignore
      await Sep31PollerService.processTransaction(mockTx);

      expect(NinePayGatewayService.disburse).not.toHaveBeenCalled();
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE sep31_transactions SET status = \'pending_customer_info_update\''),
        expect.any(Array)
      );
    });

    it('halts if bank profile is missing', async () => {
      (BankProfileModel.findByCustomerId as jest.Mock).mockResolvedValue(null);

      // @ts-ignore
      await Sep31PollerService.processTransaction(mockTx);

      expect(NinePayGatewayService.disburse).not.toHaveBeenCalled();
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining("status = 'pending_customer_info_update'"),
        ['tx-456', 'No bank profile for receiver receiver-1']
      );
      expect(db.auditLog).toHaveBeenCalledWith('tx-456', 'halted_missing_info', {
        reason: 'No bank profile for receiver receiver-1',
      });
    });

    it('rejects and does not disburse when firm quote is missing, expired, or already consumed', async () => {
      (db.query as jest.Mock).mockImplementation(async (sql: string) => {
        if (sql.includes('processing_lock')) {
          return { id: 'tx-456' };
        }
        if (sql.includes('SELECT stellar_tx_hash')) {
          return { stellar_tx_hash: 'real-hash-abc' };
        }
        if (sql.includes('UPDATE firm_quotes')) {
          return null;
        }
        return null;
      });

      // @ts-ignore
      await expect(Sep31PollerService.processTransaction(mockTx)).rejects.toThrow(
        'Quote quote-456 not found, expired, or already consumed'
      );
      expect(NinePayGatewayService.disburse).not.toHaveBeenCalled();
    });



    it('IPN: name mismatch halts disbursement → tx marked error', async () => {
      // We don't mock NinePayGatewayService.lookupAccount here because the entire NinePayGatewayService is mocked!
      // Since it's mocked, `disburse` is a mock. We just need to make `disburse` throw RECONCILIATION_FAILED.
      (NinePayGatewayService.disburse as jest.Mock).mockRejectedValueOnce(new Error('RECONCILIATION_FAILED'));
    
      (decrypt as jest.Mock).mockReturnValue('NGUYEN VAN A'); // KYC name
    
      // @ts-ignore
      await expect(Sep31PollerService.processTransaction(mockTx)).rejects.toThrow('RECONCILIATION_FAILED');
    
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining("status = 'error'"),
        expect.arrayContaining(['RECONCILIATION_FAILED'])
      );
    });

    it('decrypts bank account before passing to 9Pay', async () => {
      // @ts-ignore
      await Sep31PollerService.processTransaction(mockTx);

      // Verify disburse receives plaintext '9876543210' and 'NGUYEN VAN A'
      expect(NinePayGatewayService.disburse).toHaveBeenCalledWith(
        expect.any(Number),
        expect.any(String),
        expect.any(String),
        '9876543210',
        expect.any(String),
        'NGUYEN VAN A',
        expect.any(Object)
      );
    });

    it('notifies offchain pending and stores tax-adjusted payout details', async () => {
      // @ts-ignore
      await Sep31PollerService.processTransaction(mockTx);

      expect(AnchorRpcService.notifyOffchainFundsPending).toHaveBeenCalledWith(
        'tx-456',
        expect.stringMatching(/^NAPAS-/)
      );
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining("status = 'pending_external'"),
        ['tx-456', expect.stringMatching(/^NAPAS-/), 228600, 25400, 'PIT-AFFILIATE-10%']
      );
      expect(db.auditLog).toHaveBeenCalledWith('tx-456', 'napas_sent', expect.objectContaining({
        vnd_amount: 228600,
        withheld_tax_amount: 25400,
        tax_code: 'PIT-AFFILIATE-10%',
      }));
    });
  });

  // ── IPN Callbacks ────────────────────────────────────────────────────

  describe('POST /ipn', () => {
    it('SUCCESS → calls notifyOffchainFundsAvailable', async () => {
      (db.query as jest.Mock).mockResolvedValue(null); // No existing audit log -> not duplicate
      (AnchorRpcService.notifyOffchainFundsAvailable as jest.Mock).mockResolvedValue({ ok: true });

      const res = await request(app).post('/ipn')
        .send(mockIpnBody({ status: 'SUCCESS', transaction_id: 'tx-001', external_transaction_id: 'ext-1' }));

      expect(res.status).toBe(200);
      expect(AnchorRpcService.notifyOffchainFundsAvailable).toHaveBeenCalledWith('tx-001', 'ext-1');
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE sep31_transactions SET status = $2'),
        ['tx-001', 'completed']
      );
    });

    it('FAILED → triggers retry, marks dead_letter after max retries', async () => {
      (db.query as jest.Mock).mockImplementation(async (sql: string, params: any[]) => {
        if (sql.includes('SELECT retry_count')) {
          return { retry_count: 3 }; // Max retries exceeded
        }
        return null;
      });

      const res = await request(app).post('/ipn')
        .send(mockIpnBody({ status: 'FAILED', transaction_id: 'tx-002' }));

      expect(res.status).toBe(200);
      expect(AnchorRpcService.notifyTransactionError).toHaveBeenCalledWith(
        'tx-002', expect.any(String)
      );
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE sep31_transactions SET status = \'error\''),
        ['tx-002', 'Max retries exceeded']
      );
    });

    it('FAILED below max retries → increments retry count without terminal error', async () => {
      (db.query as jest.Mock).mockImplementation(async (sql: string) => {
        if (sql.includes('SELECT retry_count')) {
          return { retry_count: 1 };
        }
        return null;
      });

      const res = await request(app).post('/ipn')
        .send(mockIpnBody({ status: 'FAILED', transaction_id: 'tx-retry' }));

      expect(res.status).toBe(200);
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('retry_count = retry_count + 1'),
        ['tx-retry']
      );
      expect(db.auditLog).toHaveBeenCalledWith('tx-retry', 'ipn_failed_retry', {
        attempt: 2,
        next_retry_ms: 60000,
      });
      expect(AnchorRpcService.notifyTransactionError).not.toHaveBeenCalled();
    });

    it('DUPLICATE → idempotent, returns 200 without reprocessing', async () => {
      (db.query as jest.Mock).mockImplementation(async (sql: string, params: any[]) => {
        if (sql.includes('SELECT id FROM disbursement_audit_log')) {
          return { id: 'audit-1' }; // Duplicate
        }
        return null;
      });

      const res = await request(app).post('/ipn')
        .send(mockIpnBody({ status: 'SUCCESS', transaction_id: 'tx-003' }));

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Already processed');
      expect(AnchorRpcService.notifyOffchainFundsAvailable).not.toHaveBeenCalled();
    });
  });

  // ── End-to-End Flow ──────────────────────────────────────────────────
  describe('Full E2E Flow', () => {
    it('successfully processes a transaction from initiate to IPN success', async () => {
      // 1. Initiate
      (Sep31TransactionService.createTransaction as jest.Mock).mockResolvedValue({ id: 'e2e-tx-1' });
      const initRes = await request(app).post('/sep31/initiate')
        .send({ amount: '100', asset_code: 'USDC', sender_id: 's1', receiver_id: 'r1' });
      expect(initRes.status).toBe(200);

      // 2. Poller processing
      const e2eTx = {
        id: 'e2e-tx-1', amount_in: '100',
        customers: { receiver: { id: 'r1' } }
      };
      
      // Setup DB mocks for poller
      (db.query as jest.Mock).mockImplementation(async (sql: string) => {
        if (sql.includes('processing_lock')) return { id: 'e2e-tx-1' };
        if (sql.includes('SELECT stellar_tx_hash')) return { stellar_tx_hash: 'hash-1' };
        if (sql.includes('SELECT id FROM disbursement_audit_log')) return null; // IPN not dup
        return null; 
      });

      (BankProfileModel.findByCustomerId as jest.Mock).mockResolvedValue({
        id: 'p1', is_verified: true, bank_code: '123',
        encrypted_account: 'enc-acc', encrypted_name: 'enc-name'
      });
      (getSafeFxRate as jest.Mock).mockResolvedValue({ rate: 25000 });
      (NinePayGatewayService.disburse as jest.Mock).mockResolvedValue({ success: true });
      (decrypt as jest.Mock).mockReturnValue('NAME'); // Match name

      // @ts-ignore
      await Sep31PollerService.processTransaction(e2eTx);

      expect(NinePayGatewayService.disburse).toHaveBeenCalled();
      expect(AnchorRpcService.notifyOffchainFundsPending).toHaveBeenCalled();

      // 3. IPN Success
      const ipnRes = await request(app).post('/ipn')
        .send(mockIpnBody({ status: 'SUCCESS', transaction_id: 'e2e-tx-1', external_transaction_id: 'napas-ext-1' }));
      
      expect(ipnRes.status).toBe(200);
      expect(AnchorRpcService.notifyOffchainFundsAvailable).toHaveBeenCalledWith('e2e-tx-1', 'napas-ext-1');
    });
  });
});
