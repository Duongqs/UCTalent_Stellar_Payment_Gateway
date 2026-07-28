import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { OracleService } from '@uc/banking';
import { Sep31CoreService } from '@uc/core';

describe('HealthController', () => {
  let controller: HealthController;
  let mockSep31CoreService: any;
  let mockOracleService: any;

  beforeEach(async () => {
    mockSep31CoreService = {
      dataSource: {
        query: jest.fn().mockResolvedValue([{ '1': 1 }]),
      }
    };
    mockOracleService = {
      getCircuitBreakerState: jest.fn().mockReturnValue('CLOSED'),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: Sep31CoreService,
          useValue: mockSep31CoreService,
        },
        {
          provide: OracleService,
          useValue: mockOracleService,
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('should return live status without checking DB', () => {
    const res = controller.getLive();
    expect(res.status).toBe('ok');
    expect(mockSep31CoreService.dataSource.query).not.toHaveBeenCalled();
  });

  it('should return healthy status when DB is up and circuit breaker is CLOSED', async () => {
    const res = await controller.getReady();
    expect(res.status).toBe('healthy');
    expect(res.checks.database.status).toBe('ok');
    expect(res.checks.oracle_circuit_breaker).toBe('CLOSED');
  });
});
