import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { OracleService } from '@uc/banking';
import { Sep31CoreService } from '@uc/core';

@Controller('health')
export class HealthController {
  constructor(
    private readonly sep31CoreService: Sep31CoreService,
    private readonly oracleService: OracleService,
  ) { }

  @Get('live')
  getLive() {
    return {
      status: 'ok',
      service: 'uc-stellar-api',
    };
  }

  @Get(['', 'ready'])
  async getReady() {
    const start = Date.now();
    let dbStatus = 'error';
    try {
      await (this.sep31CoreService as any).dataSource.query('SELECT 1');
      dbStatus = 'ok';
    } catch {
      dbStatus = 'error';
    }

    const dbHealth = { status: dbStatus, latency_ms: Date.now() - start };
    const circuitBreaker = this.oracleService.getCircuitBreakerState();
    const dbOk = dbHealth.status === 'ok';
    const healthy = dbOk && circuitBreaker !== 'OPEN';

    const response = {
      status: !dbOk ? 'unhealthy' : healthy ? 'healthy' : 'degraded',
      checks: {
        database: dbHealth,
        oracle_circuit_breaker: circuitBreaker,
      },
    };

    if (!dbOk) {
      throw new ServiceUnavailableException(response);
    }

    return response;
  }
}
