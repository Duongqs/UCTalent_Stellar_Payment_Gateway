import { Test, TestingModule } from '@nestjs/testing';
import { IpnController } from './ipn.controller';
import { Sep31CoreService, EnvService } from '@uc/core';
import { AnchorRpcService } from '@uc/stellar';
import { NinePayGatewayService } from '@uc/banking';
import { Sep31TransactionEntity } from '@uc/core';
import * as crypto from 'crypto';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

function buildIpnPayload(payload: any, checksumKey = 'test-key') {
  const resultB64 = Buffer.from(JSON.stringify(payload)).toString('base64');
  const checksum = crypto
    .createHash('sha256')
    .update(resultB64 + checksumKey)
    .digest('hex')
    .toUpperCase();
  return { result: resultB64, checksum };
}

describe('IpnController', () => {
  let controller: IpnController;
  let mockSep31CoreService: Record<string, jest.Mock>;
  let mockAnchorRpc: Record<string, jest.Mock>;
  let mockNinePayGateway: Record<string, jest.Mock>;
  let envGet: Record<string, string | undefined>;

  beforeEach(async () => {
    envGet = {
      NINEPAY_CHECKSUM_KEY: 'test-key',
      UCTALENT_BACKEND_WEBHOOK_URL: 'https://backend.test/webhook',
      CROSS_BORDER_WEBHOOK_SECRET: 'webhook-secret',
      NODE_ENV: 'production',
    };

    mockSep31CoreService = {
      hasEventLogged: jest.fn().mockResolvedValue(false),
      completeDisbursement: jest.fn().mockResolvedValue(undefined),
      failDisbursement: jest.fn().mockResolvedValue(undefined),
      retryDisbursement: jest.fn().mockResolvedValue(undefined),
      findById: jest.fn(),
    };

    mockAnchorRpc = {
      notifyOffchainFundsAvailable: jest.fn().mockResolvedValue(undefined),
      notifyTransactionError: jest.fn().mockResolvedValue(undefined),
    };

    mockNinePayGateway = {
      checkStatus: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [IpnController],
      providers: [
        {
          provide: Sep31CoreService,
          useValue: mockSep31CoreService,
        },
        {
          provide: AnchorRpcService,
          useValue: mockAnchorRpc,
        },
        {
          provide: EnvService,
          useValue: {
            get: jest.fn((key: string) => envGet[key]),
          },
        },
        {
          provide: NinePayGatewayService,
          useValue: mockNinePayGateway,
        },
      ],
    }).compile();

    controller = module.get<IpnController>(IpnController);
    mockedAxios.post.mockReset();
  });

  describe('SUCCESS', () => {
    it('sends backend webhook when distributionId is present', async () => {
      const tx = new Sep31TransactionEntity();
      tx.id = 'tx-123';
      tx.distributionId = 'dist-abc';
      tx.vndAmount = 254000;
      tx.withheldTaxAmount = 25400;
      tx.napasRefId = 'napas-789';
      tx.stellarTxHash = 'hash-111';

      mockSep31CoreService.findById.mockResolvedValue(tx);
      mockedAxios.post.mockResolvedValue({ data: {} });

      const ipn = buildIpnPayload({
        invoice_no: 'inv-123',
        transaction_id: 'tx-123',
        external_transaction_id: 'napas-789',
        status: 'SUCCESS',
      });

      const res = await controller.handleIpn(
        { headers: {}, socket: {} },
        ipn as any,
      );

      expect(res.message).toBe('Acknowledged');
      expect(mockAnchorRpc.notifyOffchainFundsAvailable).toHaveBeenCalledWith(
        'tx-123',
        'napas-789',
      );
      expect(mockSep31CoreService.completeDisbursement).toHaveBeenCalledWith(
        'tx-123',
        'napas-789',
      );
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);

      const payload = mockedAxios.post.mock.calls[0][1] as Record<
        string,
        unknown
      >;
      expect(payload.distributionId).toBe('dist-abc');
      expect(payload.status).toBe('success');
      expect(payload.vndAmount).toBe(254000);
      expect(payload.taxWithheld).toBe(25400);
      expect(payload.napasRefId).toBe('napas-789');
      expect(payload.stellarTxHash).toBe('hash-111');
    });

    it('skips backend webhook when distributionId is missing', async () => {
      const tx = new Sep31TransactionEntity();
      tx.id = 'tx-123';
      tx.distributionId = undefined as any;

      mockSep31CoreService.findById.mockResolvedValue(tx);

      const ipn = buildIpnPayload({
        invoice_no: 'inv-123',
        transaction_id: 'tx-123',
        external_transaction_id: 'napas-789',
        status: 'SUCCESS',
      });

      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

      const res = await controller.handleIpn(
        { headers: {}, socket: {} },
        ipn as any,
      );

      expect(res.message).toBe('Acknowledged');
      expect(mockSep31CoreService.completeDisbursement).toHaveBeenCalled();
      expect(mockedAxios.post).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('distributionId is missing'),
      );

      warnSpy.mockRestore();
    });
  });

  describe('FAILED', () => {
    it('skips backend webhook when distributionId is missing after max retries', async () => {
      const tx = new Sep31TransactionEntity();
      tx.id = 'tx-456';
      tx.retryCount = 3;
      tx.distributionId = undefined as any;

      mockSep31CoreService.findById.mockResolvedValue(tx);

      const ipn = buildIpnPayload({
        invoice_no: 'inv-456',
        transaction_id: 'tx-456',
        external_transaction_id: 'napas-000',
        status: 'FAILED',
      });

      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

      const res = await controller.handleIpn(
        { headers: {}, socket: {} },
        ipn as any,
      );

      expect(res.message).toBe('Acknowledged');
      expect(mockSep31CoreService.failDisbursement).toHaveBeenCalledWith(
        'tx-456',
      );
      expect(mockAnchorRpc.notifyTransactionError).toHaveBeenCalledWith(
        'tx-456',
        'Disbursement failed after 3 retries',
      );
      expect(mockedAxios.post).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('distributionId is missing'),
      );

      warnSpy.mockRestore();
    });
  });

  describe('duplicate handling', () => {
    it('returns already processed for duplicate events', async () => {
      mockSep31CoreService.hasEventLogged.mockResolvedValue(true);

      const ipn = buildIpnPayload({
        invoice_no: 'inv-123',
        transaction_id: 'tx-123',
        external_transaction_id: 'napas-789',
        status: 'SUCCESS',
      });

      const res = await controller.handleIpn(
        { headers: {}, socket: {} },
        ipn as any,
      );

      expect(res.message).toBe('Already processed');
      expect(mockedAxios.post).not.toHaveBeenCalled();
    });
  });
});
