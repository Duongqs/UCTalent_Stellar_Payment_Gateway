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

const mockQuery = jest.fn();
const mockQueryAll = jest.fn();
const mockAuditLog = jest.fn();
const mockDecrypt = jest.fn();
const mockBankProfileModel = {
  findByCustomerId: jest.fn(),
};

jest.mock('@uc/core', () => {
  const original = jest.requireActual('@uc/core');
  return {
    ...original,
    query: (...args: any[]) => mockQuery(...args),
    queryAll: (...args: any[]) => mockQueryAll(...args),
    auditLog: (...args: any[]) => mockAuditLog(...args),
    decrypt: (...args: any[]) => mockDecrypt(...args),
    BankProfileModel: mockBankProfileModel,
  };
});

import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { DisbursementPollerService } from '../src/disbursement/disbursement-poller.service';
import { EventConsumerService } from '../src/soroban-listener/event-consumer.service';
import { SorobanListenerService } from '../src/soroban-listener/soroban-listener.service';
import { NinePayGatewayService, OracleService } from '@uc/banking';
import { AnchorRpcService } from '@uc/stellar';
import axios from 'axios';

describe('Worker E2E / Integration Flow Tests', () => {
  let moduleRef: TestingModule;
  let pollerService: DisbursementPollerService;
  let consumerService: EventConsumerService;
  let listenerService: SorobanListenerService;
  let mockNinePayGateway: Record<string, jest.Mock>;
  let mockOracleService: Record<string, jest.Mock>;
  let mockAnchorRpc: Record<string, jest.Mock>;

  beforeAll(async () => {
    process.env.ENCRYPTION_SECRET = 'a_very_secure_secret_key_that_is_at_least_32_bytes_long!';
    process.env.SEP31_WEBHOOK_URL = 'http://localhost:3000/api/webhooks/sdp';
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

    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(NinePayGatewayService)
      .useValue(mockNinePayGateway)
      .overrideProvider(OracleService)
      .useValue(mockOracleService)
      .overrideProvider(AnchorRpcService)
      .useValue(mockAnchorRpc)
      .compile();

    pollerService = moduleRef.get<DisbursementPollerService>(DisbursementPollerService);
    consumerService = moduleRef.get<EventConsumerService>(EventConsumerService);
    listenerService = moduleRef.get<SorobanListenerService>(SorobanListenerService);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
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

      mockQuery.mockImplementation(async (sql: string, params: any[]) => {
        if (sql.includes('processing_lock')) {
          return { id: 'tx-456' };
        }
        if (sql.includes('SELECT stellar_tx_hash')) {
          return { stellar_tx_hash: 'stellar-hash-abc' };
        }
        return null;
      });

      mockBankProfileModel.findByCustomerId.mockResolvedValue({
        id: 'bank-profile-id',
        is_verified: true,
        encrypted_account: 'enc-acc-123',
        encrypted_name: 'enc-name-123',
        bank_code: '970436',
      });

      mockDecrypt.mockImplementation((val: string) => {
        if (val === 'enc-acc-123') return '1012345678';
        if (val === 'enc-name-123') return 'NGUYEN VAN A';
        return val;
      });

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
        'stellar-hash-abc'
      );
      expect(mockNinePayGateway.disburse).toHaveBeenCalledWith(
        2286000,
        'tx-456',
        '970436',
        '1012345678',
        expect.any(String),
        'NGUYEN VAN A',
        expect.any(Object)
      );
      expect(mockAnchorRpc.notifyOffchainFundsPending).toHaveBeenCalled();
    });
  });

  describe('EventConsumerService', () => {
    it('should consume queue items and send signed webhooks', async () => {
      mockQuery.mockImplementation(async (sql: string) => {
        if (sql.includes('SELECT id, ledger')) {
          return {
            id: 'event-id-99',
            ledger: '12345',
            tx_hash: 'tx-hash-99',
            payload_json: JSON.stringify({ type: 'payment', amount: '10' }),
          };
        }
        return null;
      });

      (axios.post as jest.Mock).mockResolvedValue({ status: 200, data: { ok: true } });

      await consumerService.processQueue();

      expect(axios.post).toHaveBeenCalledWith(
        'http://localhost:3000/api/webhooks/sdp',
        { type: 'payment', amount: '10' },
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-UCTALENT-SIGNATURE': expect.stringContaining('sha256='),
          }),
        })
      );

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("SET status = 'completed'"),
        ['event-id-99']
      );
    });
  });
});
