import { Test, TestingModule } from '@nestjs/testing';
import { NinePayGatewayService } from './ninepay-gateway.service';
import { EnvService } from '@uc/core';
import { NameMatchingService } from './name-matching.service';

describe('NinePayGatewayService — security hardening', () => {
  it('should throw FATAL when NINEPAY_MERCHANT_KEY is missing', async () => {
    const mockEnv = {
      get: jest.fn((key: string) => {
        if (key === 'NINEPAY_SECRET_KEY') return 'prod_secret';
        if (key === 'NINEPAY_API_URL') return 'https://api.9pay.vn';
        return undefined;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NinePayGatewayService,
        { provide: EnvService, useValue: mockEnv },
        { provide: NameMatchingService, useValue: {} },
      ],
    }).compile();

    const service = module.get<NinePayGatewayService>(NinePayGatewayService);
    // Since it's a getter, we expect it to throw on access
    expect(() => (service as any).merchantKey).toThrow(/NINEPAY_MERCHANT_KEY is not configured/);
  });

  it('should throw FATAL when NINEPAY_SECRET_KEY is missing', async () => {
    const mockEnv = {
      get: jest.fn((key: string) => {
        if (key === 'NINEPAY_MERCHANT_KEY') return 'prod_merchant';
        if (key === 'NINEPAY_API_URL') return 'https://api.9pay.vn';
        return undefined;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NinePayGatewayService,
        { provide: EnvService, useValue: mockEnv },
        { provide: NameMatchingService, useValue: {} },
      ],
    }).compile();

    const service = module.get<NinePayGatewayService>(NinePayGatewayService);
    expect(() => (service as any).secretKey).toThrow(/NINEPAY_SECRET_KEY is not configured/);
  });
});
