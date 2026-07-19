process.env.NODE_ENV = 'test';

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { NinePayGatewayService, OracleService } from '@uc/banking';
import { Sep31TransactionService, AnchorRpcService } from '@uc/stellar';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Sep9ValidationService,
  CustomerEntity,
  BankProfileEntity,
  Sep31TransactionEntity,
  EncryptionService,
} from '@uc/core';
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

describe('E2E Flow Tests', () => {
  let app: INestApplication;
  let mockNinePayGateway: Record<string, jest.Mock>;
  let mockOracleService: Record<string, jest.Mock>;
  let mockSep31Service: Record<string, jest.Mock>;
  let mockAnchorRpc: Record<string, jest.Mock>;
  let mockSep9Validation: Record<string, jest.Mock>;

  let customerRepo: Repository<CustomerEntity>;
  let bankProfileRepo: Repository<BankProfileEntity>;
  let sep31Repo: Repository<Sep31TransactionEntity>;
  let encryption: EncryptionService;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.ENCRYPTION_SECRET =
      'a_very_secure_secret_key_that_is_at_least_32_bytes_long!';
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
      .overrideGuard(require('../src/auth/guards/sep10.guard').Sep10Guard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();

    customerRepo = moduleFixture.get<Repository<CustomerEntity>>(
      getRepositoryToken(CustomerEntity),
    );
    bankProfileRepo = moduleFixture.get<Repository<BankProfileEntity>>(
      getRepositoryToken(BankProfileEntity),
    );
    sep31Repo = moduleFixture.get<Repository<Sep31TransactionEntity>>(
      getRepositoryToken(Sep31TransactionEntity),
    );
    encryption = moduleFixture.get<EncryptionService>(EncryptionService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    await customerRepo.clear();
    await bankProfileRepo.clear();
    await sep31Repo.clear();
  });

  describe('Customer KYC Controller', () => {
    it('GET /customer unknown id → NEEDS_INFO', async () => {
      const res = await request(app.getHttpServer()).get(
        '/api/customer?id=unknown-uuid&type=sep31-receiver',
      );

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('NEEDS_INFO');
      expect(res.body.fields).toHaveProperty('first_name');
    });

    it('PUT /customer creates or updates KYC', async () => {
      mockSep9Validation.validate.mockReturnValue({
        isValid: true,
        errors: [],
      });

      const res = await request(app.getHttpServer()).put('/api/customer').send({
        id: 'new-cust-uuid',
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

      const res = await request(app.getHttpServer()).put('/api/customer').send({
        firstName: 'A',
        type: 'sep31-receiver',
      });

      expect(res.status).toBe(400);
    });
  });

  describe('Prices Controller', () => {
    it('GET /prices calculates rate correctly', async () => {
      mockOracleService.getSafeFxRate.mockResolvedValue({
        rate: 25400,
        rawRates: { mock: 25400 },
        usedSources: ['mock'],
        droppedSources: [],
        cachedAt: new Date(),
        method: 'single',
      });

      const res = await request(app.getHttpServer()).get(
        '/api/prices?sell_asset=stellar:USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5&buy_asset=iso4217:VND&sell_amount=10',
      );

      expect(res.status).toBe(200);
      expect(res.body.buy_assets).toBeDefined();
      expect(res.body.buy_assets[0].price).toBe('0.0000393701');
      expect(res.body.buy_assets[0].asset).toBe('iso4217:VND');
    });
  });

  describe('Bank Vault Controller', () => {
    it('POST /api/v1/bank-vault/inquiry lookup account', async () => {
      mockNinePayGateway.lookupAccount.mockResolvedValue('NGUYEN VAN A');

      const res = await request(app.getHttpServer())
        .post('/api/v1/bank-vault/inquiry')
        .set('x-uctalent-signature', 'bypass')
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
        .post('/api/sep31/initiate')
        .set('x-uctalent-signature', 'bypass')
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
      // Seed transaction
      const tx = new Sep31TransactionEntity();
      tx.id = 'tx-123';
      tx.status = 'pending_external';
      tx.amountIn = '100';
      tx.assetCode = 'USDC';
      await sep31Repo.save(tx);

      const ipnPayload = mockIpnBody({
        invoice_no: 'inv-123',
        transaction_id: 'tx-123',
        external_transaction_id: 'napas-123',
        status: 'SUCCESS',
      });

      const res = await request(app.getHttpServer())
        .post('/api/ipn')
        .send(ipnPayload);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Acknowledged');
      expect(mockAnchorRpc.notifyOffchainFundsAvailable).toHaveBeenCalledWith(
        'tx-123',
        'napas-123',
      );

      // Verify transaction status updated to completed
      const updated = await sep31Repo.findOne({ where: { id: 'tx-123' } });
      expect(updated?.status).toBe('completed');
    });
  });

  describe('Anchor Controller (Disburse & HMAC Guard)', () => {
    it('POST /anchor/disburse with invalid signature returns 401', async () => {
      await request(app.getHttpServer())
        .post('/api/anchor/disburse')
        .set('x-uctalent-signature', 'invalid')
        .send({ stellarTxHash: '0xmock' })
        .expect(401);
    });

    it('POST /anchor/disburse with bypass signature succeeds', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/anchor/disburse')
        .set('x-uctalent-signature', 'bypass')
        .send({
          stellarTxHash: '0xmock_tx_hash_12345',
          stellarMemo: 'TEST_MEMO_001',
          oracleRate: 25450,
          splits: {
            talent: { amountUsdc: 80, kycId: 'abc123' },
            scout: { amountUsdc: 0, kycId: null },
            platform: { amountUsdc: 20, kycId: null },
          },
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('processing');
      expect(res.body.disbursements).toBeDefined();
      expect(res.body.disbursements.length).toBeGreaterThan(0);
    });
  });
});
