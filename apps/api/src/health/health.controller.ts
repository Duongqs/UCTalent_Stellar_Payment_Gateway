import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { OracleService } from '@uc/banking';
import { checkHealth } from '@uc/core';

@Controller('health')
export class HealthController {
  constructor(
    private readonly oracleService: OracleService
  ) {}

  @Get()
  async getHealth() {
    const dbHealth = await checkHealth();
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
