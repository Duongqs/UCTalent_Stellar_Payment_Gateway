process.env.NODE_ENV = 'test';
process.env.ENCRYPTION_SECRET =
  'a_very_secure_secret_key_that_is_at_least_32_bytes_long!';
process.env.UCTALENT_BACKEND_WEBHOOK_URL = 'http://localhost:3000/api/v2/cross-border/webhook';
process.env.CROSS_BORDER_WEBHOOK_SECRET = 'uctalent-dev-secret';

jest.mock('@stellar/stellar-sdk', () => ({
  rpc: {
    Server: jest.fn().mockImplementation(() => ({
      getEvents: jest.fn(),
      getLatestLedger: jest.fn(),
    })),
  },
  scValToNative: jest.fn(),
  xdr: {
    TransactionEnvelope: {
      fromXdr: jest.fn(),
    },
  },
}));

jest.mock('axios', () => {
  const mockAxios = {
    create: jest.fn().mockReturnThis(),
    get: jest.fn(),
    post: jest.fn(),
    interceptors: {
      request: { use: jest.fn(), eject: jest.fn() },
      response: { use: jest.fn(), eject: jest.fn() },
    },
    defaults: {
      headers: {
        common: {},
      },
    },
  };
  return {
    __esModule: true,
    default: mockAxios,
    ...mockAxios,
  };
});

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppModule } from '../src/app.module';
import { DisbursementPollerService } from '../src/disbursement/disbursement-poller.service';
import { EventConsumerService } from '../src/soroban-listener/event-consumer.service';
import { SorobanListenerService } from '../src/soroban-listener/soroban-listener.service';
import { PendingClearingProcessorService } from '../src/disbursement/pending-clearing-processor.service';
import {
  NinePayGatewayService,
  NinePayMockService,
  OracleService,
} from '@uc/banking';
import { AnchorRpcService } from '@uc/stellar';
import {
  Sep31TransactionEntity,
  BankProfileEntity,
  CustomerEntity,
  BridgeEventQueueEntity,
  EncryptionService,
} from '@uc/core';
import axios from 'axios';

describe('Worker E2E / Integration Flow Tests', () => {
  let moduleRef: TestingModule;
  let pollerService: DisbursementPollerService;
  let consumerService: EventConsumerService;
  let listenerService: SorobanListenerService;
  let mockNinePayGateway: Record<string, jest.Mock>;
  let mockOracleService: Record<string, jest.Mock>;
  let mockAnchorRpc: Record<string, jest.Mock>;

  let sep31Repo: Repository<Sep31TransactionEntity>;
  let bankProfileRepo: Repository<BankProfileEntity>;
  let customerRepo: Repository<CustomerEntity>;
  let eventQueueRepo: Repository<BridgeEventQueueEntity>;
  let encryption: EncryptionService;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.ENCRYPTION_SECRET =
      'a_very_secure_secret_key_that_is_at_least_32_bytes_long!';
    process.env.UCTALENT_BACKEND_WEBHOOK_URL = 'http://localhost:3000/api/v2/cross-border/webhook';
    process.env.CROSS_BORDER_WEBHOOK_SECRET = 'uctalent-dev-secret';

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

    mockAnchorRpc = {
      notifyOnchainFundsReceived: jest.fn(),
      notifyOffchainFundsPending: jest.fn(),
      notifyOffchainFundsAvailable: jest.fn(),
      notifyTransactionError: jest.fn(),
      patchTransaction: jest.fn(),
    };

    const mockNinePayMock = {
      simulateDisbursement: jest.fn(),
    };

    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(NinePayGatewayService)
      .useValue(mockNinePayGateway)
      .overrideProvider(OracleService)
      .useValue(mockOracleService)
      .overrideProvider(AnchorRpcService)
      .useValue(mockAnchorRpc)
      .overrideProvider(NinePayMockService)
      .useValue(mockNinePayMock)
      .compile();

    pollerService = moduleRef.get<DisbursementPollerService>(
      DisbursementPollerService,
    );
    consumerService = moduleRef.get<EventConsumerService>(EventConsumerService);
    listenerService = moduleRef.get<SorobanListenerService>(
      SorobanListenerService,
    );

    sep31Repo = moduleRef.get<Repository<Sep31TransactionEntity>>(
      getRepositoryToken(Sep31TransactionEntity),
    );
    bankProfileRepo = moduleRef.get<Repository<BankProfileEntity>>(
      getRepositoryToken(BankProfileEntity),
    );
    customerRepo = moduleRef.get<Repository<CustomerEntity>>(
      getRepositoryToken(CustomerEntity),
    );
    eventQueueRepo = moduleRef.get<Repository<BridgeEventQueueEntity>>(
      getRepositoryToken(BridgeEventQueueEntity),
    );
    encryption = moduleRef.get<EncryptionService>(EncryptionService);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    await sep31Repo.clear();
    await bankProfileRepo.clear();
    await customerRepo.clear();
    await eventQueueRepo.clear();
  });

  describe('DisbursementPollerService', () => {
    it('should poll and process pending transactions successfully', async () => {
      (axios.get as jest.Mock).mockResolvedValue({
        data: {
          records: [
            {
              id: 'tx-456',
              amount_in: '100',
              customers: { receiver: { id: 'receiver-uuid-1' } },
            },
          ],
        },
      });

      // Seed customer
      const customer = new CustomerEntity();
      customer.id = 'receiver-uuid-1';
      customer.firstName = 'NGUYEN VAN A';
      customer.customerType = 'sep31-receiver';
      customer.status = 'ACCEPTED';
      await customerRepo.save(customer);

      // Seed bank profile
      const profile = new BankProfileEntity();
      profile.id = 'bank-profile-id';
      profile.customerId = 'receiver-uuid-1';
      profile.stellarWallet = '';
      profile.beneficiaryRefId = 'ref-123';
      profile.encryptedAccount = encryption.encrypt('1012345678');
      profile.encryptedName = encryption.encrypt('NGUYEN VAN A');
      profile.bankCode = '970436';
      profile.isVerified = true;
      profile.verifiedAt = new Date();
      await bankProfileRepo.save(profile);

      // Seed sep31 transaction
      const transaction = new Sep31TransactionEntity();
      transaction.id = 'tx-456';
      transaction.amountIn = '100';
      transaction.assetCode = 'USDC';
      transaction.senderId = 'sender-uuid-1';
      transaction.receiverId = 'receiver-uuid-1';
      transaction.status = 'pending_sender';
      transaction.stellarTxHash = 'stellar-hash-abc';
      await sep31Repo.save(transaction);

      mockOracleService.getSafeFxRate.mockResolvedValue({
        rate: 25400,
        rawRates: { mock: 25400 },
        usedSources: ['mock'],
        droppedSources: [],
        cachedAt: new Date(),
        method: 'single',
      });

      mockNinePayGateway.disburse.mockResolvedValue({ success: true });

      await pollerService.pollPendingTransactions();

      expect(mockAnchorRpc.notifyOnchainFundsReceived).toHaveBeenCalledWith(
        'tx-456',
        '100',
        'stellar-hash-abc',
      );
      expect(mockNinePayGateway.disburse).toHaveBeenCalledWith(
        2286000,
        'tx-456',
        '970436',
        '1012345678',
        expect.any(String),
        'NGUYEN VAN A',
        expect.any(Object),
      );
      expect(mockAnchorRpc.notifyOffchainFundsPending).toHaveBeenCalled();
    });
  });

  describe('EventConsumerService', () => {
    it('should consume queue items and send signed webhooks', async () => {
      // Seed bridge_events_queue
      const event = new BridgeEventQueueEntity();
      event.id = 99;
      event.ledger = 12345;
      event.txHash = 'tx-hash-99';
      event.contractId = 'contract-id-99';
      event.payloadJson = { type: 'payment', amount: '10' };
      event.status = 'pending';
      await eventQueueRepo.save(event);

      (axios.post as jest.Mock).mockResolvedValue({
        status: 200,
        data: { ok: true },
      });

      await consumerService.processQueue();

      expect(axios.post).toHaveBeenCalledWith(
        'http://localhost:8081/api/anchor/disburse',
        { type: 'payment', amount: '10' },
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-UCTALENT-SIGNATURE': expect.stringContaining('sha256='),
          }),
        }),
      );

      expect(axios.post).toHaveBeenCalledWith(
        'http://localhost:3000/api/v2/cross-border/webhook',
        { type: 'payment', amount: '10' },
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-UCTALENT-SIGNATURE': expect.stringContaining('sha256='),
          }),
        }),
      );

      // Verify status updated to completed in SQLite
      const updated = await eventQueueRepo.findOne({
        where: { txHash: 'tx-hash-99' },
      });
      expect(updated?.status).toBe('completed');
    });
  });

  describe('PendingClearingProcessorService', () => {
    let processorService: PendingClearingProcessorService;

    beforeAll(() => {
      processorService = moduleRef.get<PendingClearingProcessorService>(
        PendingClearingProcessorService,
      );
    });

    it('should poll, lock and process pending_clearing transactions successfully', async () => {
      // Seed customer
      const customer = new CustomerEntity();
      customer.id = 'receiver-uuid-2';
      customer.firstName = 'TRAN VAN B';
      customer.customerType = 'sep31-receiver';
      customer.status = 'ACCEPTED';
      await customerRepo.save(customer);

      // Seed bank profile
      const profile = new BankProfileEntity();
      profile.id = 'bank-profile-id-2';
      profile.customerId = 'receiver-uuid-2';
      profile.stellarWallet = '';
      profile.beneficiaryRefId = 'ref-456';
      profile.encryptedAccount = encryption.encrypt('0987654321');
      profile.encryptedName = encryption.encrypt('TRAN VAN B');
      profile.bankCode = '970415';
      profile.isVerified = true;
      profile.verifiedAt = new Date();
      await bankProfileRepo.save(profile);

      // Seed sep31 transaction in pending_clearing status
      const transaction = new Sep31TransactionEntity();
      transaction.id = 'tx-789';
      transaction.amountIn = '200';
      transaction.assetCode = 'USDC';
      transaction.senderId = 'sender-uuid-2';
      transaction.receiverId = 'receiver-uuid-2';
      transaction.status = 'pending_clearing';
      transaction.stellarTxHash = 'stellar-hash-def';
      transaction.vndAmount = 5080000; // e.g. 200 USDC * 25400
      await sep31Repo.save(transaction);

      mockNinePayGateway.disburse.mockResolvedValue({ success: true });

      await processorService.processPendingClearing();

      // Check that NinePay disburse was called with correct values (including PIT 10% deduction: 5080000 * 0.9 = 4572000)
      expect(mockNinePayGateway.disburse).toHaveBeenCalledWith(
        4572000,
        'tx-789',
        '970415',
        '0987654321',
        expect.any(String),
        'TRAN VAN B',
        expect.any(Object),
      );

      expect(mockAnchorRpc.notifyOffchainFundsPending).toHaveBeenCalledWith(
        'tx-789',
        expect.any(String),
      );

      // Check transaction status was updated to pending_external
      const updated = await sep31Repo.findOne({ where: { id: 'tx-789' } });
      expect(updated?.status).toBe('pending_external');
      expect(updated?.withheldTaxAmount).toBe(508000);
      expect(updated?.vndAmount).toBe(4572000);
    });

    it('should NOT apply PIT tax when amount is below PIT_THRESHOLD_VND', async () => {
      // Seed customer
      const customer = new CustomerEntity();
      customer.id = 'receiver-uuid-3';
      customer.firstName = 'LE VAN C';
      customer.customerType = 'sep31-receiver';
      customer.status = 'ACCEPTED';
      await customerRepo.save(customer);

      // Seed bank profile
      const profile = new BankProfileEntity();
      profile.id = 'bank-profile-id-3';
      profile.customerId = 'receiver-uuid-3';
      profile.stellarWallet = '';
      profile.beneficiaryRefId = 'ref-789';
      profile.encryptedAccount = encryption.encrypt('1112223334');
      profile.encryptedName = encryption.encrypt('LE VAN C');
      profile.bankCode = '970415';
      profile.isVerified = true;
      profile.verifiedAt = new Date();
      await bankProfileRepo.save(profile);

      // Seed sep31 transaction in pending_clearing status
      const transaction = new Sep31TransactionEntity();
      transaction.id = 'tx-890';
      transaction.amountIn = '39';
      transaction.assetCode = 'USDC';
      transaction.senderId = 'sender-uuid-3';
      transaction.receiverId = 'receiver-uuid-3';
      transaction.status = 'pending_clearing';
      transaction.stellarTxHash = 'stellar-hash-ghi';
      transaction.vndAmount = 1000000; // < 2M
      await sep31Repo.save(transaction);

      mockNinePayGateway.disburse.mockResolvedValue({ success: true });

      await processorService.processPendingClearing();

      // Should be disbursed in full (1000000), tax = 0
      expect(mockNinePayGateway.disburse).toHaveBeenCalledWith(
        1000000,
        'tx-890',
        '970415',
        '1112223334',
        expect.any(String),
        'LE VAN C',
        expect.any(Object),
      );

      const updated = await sep31Repo.findOne({ where: { id: 'tx-890' } });
      expect(updated?.status).toBe('pending_external');
      expect(updated?.withheldTaxAmount).toBe(0);
      expect(updated?.vndAmount).toBe(1000000);
      expect(updated?.taxCode).toBeNull();
    });
  });
});
