jest.mock('uuid', () => ({
  v4: () => 'mock-uuid-123'
}));

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { 
  CustomerModel, 
  BankProfileModel, 
  query, 
  queryAll, 
  auditLog, 
  decrypt 
} from '@uc/core';
import { NinePayGatewayService, NinePayMockService, getSafeFxRate } from '@uc/banking';
import { Sep31TransactionService, AnchorRpcService } from '@uc/stellar';
import * as crypto from 'crypto';

function mockIpnBody(payload: any) {
  const resultB64 = Buffer.from(JSON.stringify(payload)).toString('base64');
  const checksum = crypto
    .createHash('sha256')
    .update(resultB64 + (process.env.NINEPAY_CHECKSUM_KEY || ''))
    .digest('hex')
    .toUpperCase();
  return { result: resultB64, checksum };
}

jest.mock('@uc/core', () => {
  const original = jest.requireActual('@uc/core');
  return {
    ...original,
    query: jest.fn(),
    queryAll: jest.fn(),
    auditLog: jest.fn(),
    decrypt: jest.fn(),
    CustomerModel: {
      findById: jest.fn(),
      findByAccount: jest.fn(),
      createOrUpdate: jest.fn(),
    },
    BankProfileModel: {
      create: jest.fn(),
      findByCustomerId: jest.fn(),
      findByRefId: jest.fn(),
      markVerified: jest.fn(),
    },
  };
});

jest.mock('@uc/banking', () => {
  const original = jest.requireActual('@uc/banking');
  return {
    ...original,
    NinePayGatewayService: {
      lookupAccount: jest.fn(),
      disburse: jest.fn(),
    },
    NinePayMockService: {
      simulateDisbursement: jest.fn(),
    },
    getSafeFxRate: jest.fn(),
    getCircuitBreakerState: jest.fn().mockReturnValue('CLOSED'),
  };
});

jest.mock('@uc/stellar', () => {
  const original = jest.requireActual('@uc/stellar');
  return {
    ...original,
    Sep31TransactionService: {
      createTransaction: jest.fn(),
    },
    AnchorRpcService: {
      notifyOnchainFundsReceived: jest.fn(),
      notifyOffchainFundsPending: jest.fn(),
      notifyOffchainFundsAvailable: jest.fn(),
      notifyTransactionError: jest.fn(),
    },
  };
});

describe('E2E Flow Tests', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.ENCRYPTION_SECRET = 'a_very_secure_secret_key_that_is_at_least_32_bytes_long!';
    process.env.NINEPAY_CHECKSUM_KEY = 'test-key';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─── SEP-12 CUSTOMER Webhook Tests ────────────────────────────────────
  describe('Customer KYC Controller', () => {
    it('GET /customer unknown id → NEEDS_INFO', async () => {
      (CustomerModel.findById as jest.Mock).mockResolvedValue(null);

      const res = await request(app.getHttpServer())
        .get('/customer?id=unknown-uuid&type=sep31-receiver');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('NEEDS_INFO');
      expect(res.body.fields).toHaveProperty('first_name');
    });

    it('PUT /customer creates or updates KYC and returns status accepted', async () => {
      (CustomerModel.createOrUpdate as jest.Mock).mockResolvedValue({
        id: 'new-cust-uuid',
        status: 'ACCEPTED',
      });

      const res = await request(app.getHttpServer())
        .put('/customer')
        .send({
          first_name: 'A',
          last_name: 'B',
          email_address: 'a@b.c',
          id_number: '12345',
          id_country: 'VNM',
          type: 'sep31-receiver',
        });

      expect(res.status).toBe(202);
      expect(res.body.id).toBe('new-cust-uuid');
    });

    it('PUT /customer rejects invalid inputs', async () => {
      const res = await request(app.getHttpServer())
        .put('/customer')
        .send({
          firstName: 'A', // invalid field (not snake_case)
          type: 'sep31-receiver',
        });

      expect(res.status).toBe(400);
    });
  });

  // ─── SEP-38 RATE Oracle Tests ──────────────────────────────────────────
  describe('Rate Controller', () => {
    it('GET /rate calculates rate correctly', async () => {
      (getSafeFxRate as jest.Mock).mockResolvedValue({
        rate: 25400,
        method: 'mock-fx',
      });

      const res = await request(app.getHttpServer())
        .get('/rate?type=indicative&sell_asset=stellar:USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5&buy_asset=iso4217:VND&sell_amount=10');

      expect(res.status).toBe(200);
      expect(res.body.rate.price).toBe('0.0000393701');
      expect(res.body.rate.buy_amount).toBe('254000');
    });
  });

  // ─── BANK VAULT Tests ────────────────────────────────────────────────
  describe('Bank Vault Controller', () => {
    it('POST /api/v1/bank-vault/inquiry lookup account', async () => {
      (NinePayGatewayService.lookupAccount as jest.Mock).mockResolvedValue('NGUYEN VAN A');

      const res = await request(app.getHttpServer())
        .post('/api/v1/bank-vault/inquiry')
        .send({
          bankCode: '970436',
          accountNumber: '123456',
        });

      expect(res.status).toBe(200);
      expect(res.body.accountName).toBe('NGUYEN VAN A');
    });
  });

  // ─── SEP-31 TRANSACTION Tests ────────────────────────────────────────
  describe('SEP-31 Controller', () => {
    it('POST /sep31/initiate create transaction', async () => {
      (Sep31TransactionService.createTransaction as jest.Mock).mockResolvedValue({
        id: 'stellar-tx-id',
        stellar_account: 'GABC',
        stellar_memo: '12345',
        stellar_memo_type: 'text',
      });

      const res = await request(app.getHttpServer())
        .post('/sep31/initiate')
        .send({
          amount: '10',
          sender_id: 'sender-1',
          receiver_id: 'receiver-1',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.transactionId).toBe('stellar-tx-id');
    });
  });

  // ─── 9PAY IPN Webhook Tests ──────────────────────────────────────────
  describe('IPN Controller', () => {
    it('POST /ipn callback triggers SUCCESS process', async () => {
      (query as jest.Mock).mockImplementation(async (sql: string) => {
        if (sql.includes('disbursement_audit_log')) return null; // no duplicate
        return { rows: [] };
      });

      const ipnPayload = mockIpnBody({
        invoice_no: 'inv-123',
        transaction_id: 'tx-123',
        external_transaction_id: 'napas-123',
        status: 'SUCCESS',
      });

      const res = await request(app.getHttpServer())
        .post('/ipn')
        .send(ipnPayload);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Acknowledged');
      expect(AnchorRpcService.notifyOffchainFundsAvailable).toHaveBeenCalledWith('tx-123', 'napas-123');
    });
  });
});
