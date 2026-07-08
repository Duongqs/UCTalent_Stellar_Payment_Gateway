import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { OracleService } from '@uc/banking';

@Controller('health')
export class HealthController {
  constructor(
    private readonly dataSource: DataSource,
    private readonly oracleService: OracleService,
  ) {}

  @Get()
  async getHealth() {
    const start = Date.now();
    let dbStatus = 'error';
    try {
      await this.dataSource.query('SELECT 1');
      dbStatus = 'ok';
    } catch (e) {}

    const dbHealth = { status: dbStatus, latency_ms: Date.now() - start };
    const circuitBreaker = this.oracleService.getCircuitBreakerState();
    const healthy = dbHealth.status === 'ok' && circuitBreaker !== 'OPEN';

    const response = {
      status: healthy ? 'healthy' : 'degraded',
      checks: {
        database: dbHealth,
        oracle_circuit_breaker: circuitBreaker,
      },
    };

    if (!healthy) {
      throw new ServiceUnavailableException(response);
    }

    return response;
  }
}
