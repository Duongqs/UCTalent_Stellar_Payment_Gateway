import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { checkHealth } from '@uc/core';
import { getCircuitBreakerState } from '@uc/banking';

@Controller('health')
export class HealthController {
  @Get()
  async getHealth() {
    const dbHealth = await checkHealth();
    const circuitBreaker = getCircuitBreakerState();
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
