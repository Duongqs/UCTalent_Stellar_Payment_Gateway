import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['local', 'development', 'production', 'test']).default('local'),
  PORT: z.coerce.number().default(8081),

  POSTGRES_HOST: z.string().default('localhost'),
  POSTGRES_PORT: z.coerce.number().default(5432),
  POSTGRES_USER: z.string().default('postgres'),
  POSTGRES_PASSWORD: z.string().default('password'),
  POSTGRES_DB: z.string().default('uct_cross_border_dev'),
  POSTGRES_DB_TEST: z.string().default('uct_cross_border_dev_test'),

  SOROBAN_RPC_URL: z.string().default('https://soroban-testnet.stellar.org'),
  NETWORK_PASSPHRASE: z.string().default('Test SDF Network ; September 2015'),
  USDC_ISSUER: z.string().default('GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5'),
  TOKEN_DECIMALS: z.coerce.number().default(7),
  POLL_INTERVAL_MS: z.coerce.number().default(5000),
  PROCESS_INTERVAL_MS: z.coerce.number().default(2000),

  NINEPAY_MERCHANT_KEY: z.string().optional(),
  NINEPAY_SECRET_KEY: z.string().optional(),
  NINEPAY_CHECKSUM_KEY: z.string().optional(),
  NINEPAY_API_URL: z.string().default('https://sand-payment.9pay.vn'),
  NINEPAY_MODE: z.enum(['mock', 'live']).default('mock'),

  ORACLE_HARD_BOUND_MIN: z.coerce.number().default(23000),
  ORACLE_HARD_BOUND_MAX: z.coerce.number().default(28000),
  ORACLE_SAFETY_SPREAD: z.coerce.number().default(0.99),
  ORACLE_CACHE_TTL_MS: z.coerce.number().default(60000),

  ENCRYPTION_SECRET: z.string().min(32, 'ENCRYPTION_SECRET must be at least 32 chars').default('a_very_secure_secret_key_that_is_at_least_32_bytes_long!'),

  UCTALENT_BACKEND_WEBHOOK_URL: z.string().default('http://localhost:3000/api/v2/cross-border/settlement-callback'),
  WEBHOOK_SECRET: z.string().default('uctalent-dev-secret'),
  CROSS_BORDER_WEBHOOK_SECRET: z.string().default('uctalent-dev-secret'),
  SEP31_WEBHOOK_URL: z.string().default('http://localhost:4000/api/anchor/disburse'),

  ANCHOR_PLATFORM_URL: z.string().default('http://localhost:8082'),
  PLATFORM_SERVER_URL: z.string().default('http://localhost:8085'),

  ALLOWED_WEBHOOK_IPS: z.string().default('127.0.0.1,::1,*'),
  USE_MOCK_NINEPAY: z.string().optional(),
  USE_MOCK_IPN: z.string().optional(),
  SLACK_ALERT_WEBHOOK: z.string().optional(),
  ESCROW_CONTRACT_ID: z.string().optional(),
  FUNDING_SECRET: z.string().default('SCQMGZP23PYPUUG652FNE4M44O5CB3NV3CPEXXVF7H6EJJ3SCUJZL6HO'),
  ANCHOR_SIGNING_KEY: z.string().optional(),
});

export type EnvConfig = z.infer<typeof envSchema>;
