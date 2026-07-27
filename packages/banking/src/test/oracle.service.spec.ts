import { Test, TestingModule } from '@nestjs/testing';
import { EnvService } from '@uc/core';
import { OracleService } from '../services/oracle.service';
import { OracleSourceRegistry } from '../oracle-sources/oracle-source.registry';
import { OracleSource } from '../oracle-sources/oracle-source.interface';

describe('OracleService', () => {
  let service: OracleService;
  let registry: OracleSourceRegistry;
  let envService: jest.Mocked<EnvService>;

  beforeEach(async () => {
    envService = {
      get: jest.fn(),
    } as any;

    registry = new OracleSourceRegistry();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OracleService,
        { provide: EnvService, useValue: envService },
        { provide: OracleSourceRegistry, useValue: registry },
      ],
    }).compile();

    service = module.get<OracleService>(OracleService);
  });

  it('should calculate median from valid sources and apply safety spread', async () => {
    envService.get.mockImplementation((key) => {
      if (key === 'ORACLE_SOURCES') return 's1,s2,s3';
      if (key === 'ORACLE_MIN_VALID_SOURCES') return 3;
      if (key === 'ORACLE_OUTLIER_METHOD') return 'iqr';
      if (key === 'ORACLE_HARD_BOUND_MIN') return 20000;
      if (key === 'ORACLE_HARD_BOUND_MAX') return 30000;
      if (key === 'ORACLE_SAFETY_SPREAD') return 1;
      return null;
    });

    registry.registerAll([
      { name: 's1', fetch: async () => 25000 },
      { name: 's2', fetch: async () => 25100 },
      { name: 's3', fetch: async () => 25200 },
    ]);

    const res = await service.getSafeFxRate();
    expect(res.rate).toBe(25100);
    expect(res.usedSources.length).toBe(3);
  });

  it('should detect outliers using IQR', async () => {
    envService.get.mockImplementation((key) => {
      if (key === 'ORACLE_SOURCES') return 's1,s2,s3,s4,s5';
      if (key === 'ORACLE_MIN_VALID_SOURCES') return 3;
      if (key === 'ORACLE_OUTLIER_METHOD') return 'iqr';
      if (key === 'ORACLE_HARD_BOUND_MIN') return 20000;
      if (key === 'ORACLE_HARD_BOUND_MAX') return 60000;
      if (key === 'ORACLE_SAFETY_SPREAD') return 1;
      return null;
    });

    registry.registerAll([
      { name: 's1', fetch: async () => 25000 },
      { name: 's2', fetch: async () => 25100 },
      { name: 's3', fetch: async () => 25050 },
      { name: 's4', fetch: async () => 25150 },
      { name: 's5', fetch: async () => 50000 }, // Outlier!
    ]);

    const res = await service.getSafeFxRate();
    // expected order after sort: s1, s3, s2, s4
    expect(res.usedSources).toContain('s1');
    expect(res.usedSources).toContain('s2');
    expect(res.usedSources).toContain('s3');
    expect(res.usedSources).toContain('s4');
    expect(res.droppedSources.some(d => d.includes('OUTLIER'))).toBeTruthy();
    expect(res.rate).toBe(25075); // Median of 25000, 25050, 25100, 25150
  });

  it('should throw error if all sources fail', async () => {
    envService.get.mockImplementation((key) => {
      if (key === 'ORACLE_SOURCES') return 's1';
      return null;
    });

    registry.registerAll([
      { name: 's1', fetch: async () => { throw new Error('Network error') } },
    ]);

    await expect(service.getSafeFxRate()).rejects.toThrow('ALL_SOURCES_FAILED');
  });
});
