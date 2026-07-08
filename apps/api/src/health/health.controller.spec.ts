import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { DataSource } from 'typeorm';
import { OracleService } from '@uc/banking';

describe('HealthController', () => {
  let controller: HealthController;
  let mockDataSource: any;
  let mockOracleService: any;

  beforeEach(async () => {
    mockDataSource = {
      query: jest.fn().mockResolvedValue([{ '1': 1 }]),
    };
    mockOracleService = {
      getCircuitBreakerState: jest.fn().mockReturnValue('CLOSED'),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
        {
          provide: OracleService,
          useValue: mockOracleService,
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('should return healthy status when DB is up and circuit breaker is CLOSED', async () => {
    const res = await controller.getHealth();
    expect(res.status).toBe('healthy');
    expect(res.checks.database.status).toBe('ok');
    expect(res.checks.oracle_circuit_breaker).toBe('CLOSED');
  });
});
