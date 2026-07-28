import { Test, TestingModule } from '@nestjs/testing';
import { AnchorWebhookGuard } from './anchor-webhook.guard';
import { EnvService } from '@uc/core';
import { UnauthorizedException } from '@nestjs/common';

describe('AnchorWebhookGuard — security hardening', () => {
  it('should construct successfully with valid config', async () => {
    const mockEnv = {
      get: jest.fn((key: string) => {
        if (key === 'WEBHOOK_SECRET') return 'prod_webhook_secret_here_1234567890abcdef';
        if (key === 'ALLOWED_WEBHOOK_IPS') return '127.0.0.1';
        return undefined;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnchorWebhookGuard,
        { provide: EnvService, useValue: mockEnv },
      ],
    }).compile();

    expect(() => module.get<AnchorWebhookGuard>(AnchorWebhookGuard)).not.toThrow();
  });
});
