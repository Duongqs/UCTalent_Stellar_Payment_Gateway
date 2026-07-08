import { Test, TestingModule } from '@nestjs/testing';
import { EventConsumerService } from './event-consumer.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BridgeEventQueueEntity, EnvService } from '@uc/core';

describe('EventConsumerService', () => {
  let service: EventConsumerService;
  let mockRepo: any;
  let mockEnvService: any;

  beforeEach(async () => {
    mockRepo = {
      findOne: jest.fn(),
      update: jest.fn(),
    };

    mockEnvService = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'SEP31_WEBHOOK_URL')
          return 'http://localhost:4000/api/anchor/disburse';
        if (key === 'CROSS_BORDER_WEBHOOK_SECRET') return 'uctalent-dev-secret';
        return undefined;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventConsumerService,
        {
          provide: getRepositoryToken(BridgeEventQueueEntity),
          useValue: mockRepo,
        },
        {
          provide: EnvService,
          useValue: mockEnvService,
        },
      ],
    }).compile();

    service = module.get<EventConsumerService>(EventConsumerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
