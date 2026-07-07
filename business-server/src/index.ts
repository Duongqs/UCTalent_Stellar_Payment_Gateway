import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { CustomerController } from './callbacks/customer.controller';
import { RateController } from './callbacks/rate.controller';
import { IpnController } from './callbacks/ipn.controller';
import { Sep31Controller } from './callbacks/sep31.controller';
import { Sep31PollerService } from './services/sep31-poller.service';
import { checkHealth } from './db';
import { getCircuitBreakerState } from './services/oracle.service';

const app = express();
const PORT = process.env.PORT || 8081;

// ─── Middleware ────────────────────────────────────────────────────────────────

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Health Check ─────────────────────────────────────────────────────────────

app.get('/health', async (_req, res) => {
  const dbHealth = await checkHealth();
  const circuitBreaker = getCircuitBreakerState();
  const healthy = dbHealth.status === 'ok' && circuitBreaker !== 'OPEN';

  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'healthy' : 'degraded',
    checks: {
      database: dbHealth,
      oracle_circuit_breaker: circuitBreaker,
    },
  });
});

// ─── SEP-12 KYC Callbacks ─────────────────────────────────────────────────────

app.get('/customer', CustomerController.getCustomer);
app.put('/customer', CustomerController.putCustomer);

// ─── SEP-38 Rate/Quote Callbacks ──────────────────────────────────────────────

app.get('/rate', RateController.getRate);
app.get('/quote/:id', RateController.getQuote);

import { BankVaultController } from './callbacks/bank-vault.controller';

// ─── SEP-31 Disbursement ─────────────────────────────────────────────────────

app.post('/sep31/initiate', Sep31Controller.initiateDisbursement);

// ─── Bank Vault Callbacks ────────────────────────────────────────────────────

app.post('/api/v1/bank-vault/inquiry', BankVaultController.inquiry);
app.post('/api/v1/bank-vault/register', BankVaultController.register);

// ─── 9Pay IPN Webhook ─────────────────────────────────────────────────────────

app.post('/ipn', IpnController.handleIpn);

// ─── Start Server ─────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`[Business Server] Running on port ${PORT}`);
  console.log(`[Business Server] Environment: ${process.env.NODE_ENV || 'development'}`);
  Sep31PollerService.startPolling();
});
