import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { NinePayGatewayService, OracleService } from '@uc/banking';
import { Sep31TransactionService, AnchorRpcService } from '@uc/stellar';
import { Sep9ValidationService, query as rawQuery } from '@uc/core';
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

const mockQuery = jest.fn();
const mockQueryAll = jest.fn();
const mockAuditLog = jest.fn();
const mockCustomerModel = {
  findById: jest.fn(),
  findByAccount: jest.fn(),
  createOrUpdate: jest.fn(),
};
const mockBankProfileModel = {
  create: jest.fn(),
  findByCustomerId: jest.fn(),
  findByRefId: jest.fn(),
  markVerified: jest.fn(),
};

jest.mock('@uc/core', () => {
  const original = jest.requireActual('@uc/core');
  return {
    ...original,
    query: (...args: any[]) => mockQuery(...args),
    queryAll: (...args: any[]) => mockQueryAll(...args),
    auditLog: (...args: any[]) => mockAuditLog(...args),
    decrypt: jest.fn().mockReturnValue('decrypted-value'),
    CustomerModel: mockCustomerModel,
    BankProfileModel: mockBankProfileModel,
  };
});

describe('E2E Flow Tests', () => {
  let app: INestApplication;
  let mockNinePayGateway: Record<string, jest.Mock>;
  let mockOracleService: Record<string, jest.Mock>;
  let mockSep31Service: Record<string, jest.Mock>;
  let mockAnchorRpc: Record<string, jest.Mock>;
  let mockSep9Validation: Record<string, jest.Mock>;

  beforeAll(async () => {
    process.env.ENCRYPTION_SECRET = 'a_very_secure_secret_key_that_is_at_least_32_bytes_long!';
    process.env.NINEPAY_CHECKSUM_KEY = 'test-key';

    mockNinePayGateway = {
      lookupAccount: jest.fn(),
      disburse: jest.fn(),
    };

    mockOracleService = {
      getSafeFxRate: jest.fn(),
      invalidateCache: jest.fn(),
      getCircuitBreakerState: jest.fn().mockReturnValue('CLOSED'),
      resetCircuitBreaker: jest.fn(),
    };

    mockSep31Service = {
      createTransaction: jest.fn(),
    };

    mockAnchorRpc = {
      notifyOnchainFundsReceived: jest.fn(),
      notifyOffchainFundsPending: jest.fn(),
      notifyOffchainFundsAvailable: jest.fn(),
      notifyTransactionError: jest.fn(),
      patchTransaction: jest.fn(),
    };

    mockSep9Validation = {
      validate: jest.fn(),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(NinePayGatewayService)
      .useValue(mockNinePayGateway)
      .overrideProvider(OracleService)
      .useValue(mockOracleService)
      .overrideProvider(Sep31TransactionService)
      .useValue(mockSep31Service)
      .overrideProvider(AnchorRpcService)
      .useValue(mockAnchorRpc)
      .overrideProvider(Sep9ValidationService)
      .useValue(mockSep9Validation)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Customer KYC Controller', () => {
    it('GET /customer unknown id → NEEDS_INFO', async () => {
      mockCustomerModel.findById.mockResolvedValue(null);

      const res = await request(app.getHttpServer())
        .get('/customer?id=unknown-uuid&type=sep31-receiver');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('NEEDS_INFO');
      expect(res.body.fields).toHaveProperty('first_name');
    });

    it('PUT /customer creates or updates KYC', async () => {
      mockCustomerModel.createOrUpdate.mockResolvedValue({
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
      mockSep9Validation.validate.mockReturnValue({
        isValid: false,
        errors: ["Field 'firstName' must be snake_case."],
      });

      const res = await request(app.getHttpServer())
        .put('/customer')
        .send({
          firstName: 'A',
          type: 'sep31-receiver',
        });

      expect(res.status).toBe(400);
    });
  });

  describe('Rate Controller', () => {
    it('GET /rate calculates rate correctly', async () => {
      mockOracleService.getSafeFxRate.mockResolvedValue({
        rate: 25400,
        rawRates: { mock: 25400 },
        usedSources: ['mock'],
        droppedSources: [],
        cachedAt: new Date(),
        method: 'single',
      });

      const res = await request(app.getHttpServer())
        .get('/rate?type=indicative&sell_asset=stellar:USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5&buy_asset=iso4217:VND&sell_amount=10');

      expect(res.status).toBe(200);
      expect(res.body.rate.price).toBe('0.0000393701');
      expect(res.body.rate.buy_amount).toBe('254000');
    });
  });

  describe('Bank Vault Controller', () => {
    it('POST /api/v1/bank-vault/inquiry lookup account', async () => {
      mockNinePayGateway.lookupAccount.mockResolvedValue('NGUYEN VAN A');

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

  describe('SEP-31 Controller', () => {
    it('POST /sep31/initiate create transaction', async () => {
      mockSep31Service.createTransaction.mockResolvedValue({
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

  describe('IPN Controller', () => {
    it('POST /ipn callback triggers SUCCESS process', async () => {
      mockQuery.mockImplementation(async (sql: string) => {
        if (sql.includes('disbursement_audit_log')) return null;
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
      expect(mockAnchorRpc.notifyOffchainFundsAvailable).toHaveBeenCalledWith('tx-123', 'napas-123');
    });
  });
});
