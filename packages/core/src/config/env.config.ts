import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z
    .enum(['local', 'development', 'production', 'test'])
    .default('local'),
  PORT: z.coerce.number().default(8081),

  POSTGRES_HOST: z.string().default('localhost'),
  POSTGRES_PORT: z.coerce.number().default(5432),
  POSTGRES_USER: z.string().default('postgres'),
  POSTGRES_PASSWORD: z.string().default('password'),
  POSTGRES_DB: z.string().default('uct_cross_border_dev'),
  POSTGRES_DB_TEST: z.string().default('uct_cross_border_dev_test'),

  SOROBAN_RPC_URL: z.string().default('https://soroban-testnet.stellar.org'),
  NETWORK_PASSPHRASE: z.string().default('Test SDF Network ; September 2015'),
  USDC_ISSUER: z.string(),
  TOKEN_DECIMALS: z.coerce.number().default(7),
  POLL_INTERVAL_MS: z.coerce.number().default(5000),
  PROCESS_INTERVAL_MS: z.coerce.number().default(2000),

  NINEPAY_MERCHANT_KEY: z.string().optional(),
  NINEPAY_SECRET_KEY: z.string().optional(),
  NINEPAY_CHECKSUM_KEY: z.string().optional(),
  NINEPAY_API_URL: z.string().default('https://sand-payment.9pay.vn'),
  NINEPAY_MODE: z.enum(['mock', 'live']).default('mock'),

  PIT_THRESHOLD_VND: z.coerce.number().default(2_000_000),
  PIT_BANK_CODE: z.string().optional(),
  PIT_ACCOUNT_NUMBER: z.string().optional(),
  PIT_ACCOUNT_NAME: z.string().optional(),

  EXCHANGERATE_HOST_API_KEY: z.string().optional(),
  ORACLE_SOURCES: z
    .string()
    .default(
      'vietcombank,bidv,vietinbank,techcombank,coingecko_usdc,coingecko_usdt,exchangerate_api_usd,currency_api_usd,exchangerate_host,frankfurter,coingecko_peg,coinbase_peg,binance_peg,okx_peg',
    ),
  ORACLE_OUTLIER_METHOD: z.enum(['iqr', 'threshold']).default('iqr'),
  ORACLE_OUTLIER_THRESHOLD_PCT: z.coerce.number().default(3),
  ORACLE_MIN_VALID_SOURCES: z.coerce.number().default(4),
  ORACLE_HARD_BOUND_MIN: z.coerce.number().default(23000),
  ORACLE_HARD_BOUND_MAX: z.coerce.number().default(28000),
  ORACLE_SAFETY_SPREAD: z.coerce.number().default(0.995),
  ORACLE_PEG_DEVIATION_ALERT: z.coerce.number().default(0.005),
  ORACLE_RATE_CHANGE_GUARD_PCT: z.coerce.number().default(0.03),
  ORACLE_WEIGHT_BANK: z.coerce.number().default(3),
  ORACLE_WEIGHT_CRYPTO_DIRECT: z.coerce.number().default(2.5),
  ORACLE_WEIGHT_AGGREGATOR: z.coerce.number().default(1.5),
  ORACLE_BANK_SOURCES: z.string().default('vietcombank,bidv,vietinbank,techcombank'),
  ORACLE_PEG_SOURCES: z.string().default('coingecko_peg,coinbase_peg,binance_peg,okx_peg'),
  ORACLE_CROSS_GROUP_MAX_DIFF: z.coerce.number().default(0.02),
  ORACLE_CIRCUIT_FAILURE_THRESHOLD: z.coerce.number().default(3),
  ORACLE_CIRCUIT_RECOVERY_MS: z.coerce.number().default(30000),
  ORACLE_CACHE_TTL_MS: z.coerce.number().default(60000),

  ENCRYPTION_SECRET: z
    .string()
    .min(32, 'ENCRYPTION_SECRET must be at least 32 chars')
    .default('a_very_secure_secret_key_that_is_at_least_32_bytes_long!'),

  UCTALENT_BACKEND_WEBHOOK_URL: z
    .string()
    .default('http://localhost:3000/api/v2/cross-border/settlement-callback'),
  WEBHOOK_SECRET: z.string().default('uctalent-dev-secret'),
  CROSS_BORDER_WEBHOOK_SECRET: z.string().default('uctalent-dev-secret'),
  SEP31_WEBHOOK_URL: z
    .string()
    .default('http://localhost:4000/api/anchor/disburse'),
  STELLAR_API_BASE_URL: z
    .string()
    .default('http://localhost:8081'),

  ANCHOR_PLATFORM_URL: z.string().default('http://localhost:8082'),
  PLATFORM_SERVER_URL: z.string().default('http://localhost:8085'),
  PLATFORM_TREASURY_ADDRESS: z.string().optional(),

  ALLOWED_WEBHOOK_IPS: z.string().default('127.0.0.1,::1,*'),
  USE_MOCK_NINEPAY: z.string().optional(),
  USE_MOCK_IPN: z.string().optional(),
  SLACK_ALERT_WEBHOOK: z.string().optional(),
  ESCROW_CONTRACT_ID: z.string().optional(),
  FUNDING_SECRET: z
    .string()
    .default(''),
  ANCHOR_SIGNING_KEY: z.string().optional(),
  ANCHOR_SIGNING_SECRET: z.string().optional(),
  PLATFORM_SECRET_KEY: z.string().optional(),
  WEB_AUTH_ENDPOINT: z.string().default('http://localhost:4000/auth'),
  JWT_SECRET: z
    .string()
    .min(32, 'JWT_SECRET must be at least 32 chars')
    .default('super_secret_jwt_key_that_is_at_least_32_bytes_long!'),

  // Run scripts/migrations/*.sql on API boot (tracked in uc_stellar_schema_migrations)
  // NOTE: do NOT use Rails table name "schema_migrations" on shared DBs
  AUTO_RUN_MIGRATIONS: z
    .string()
    .default('true')
    .transform((val) => val === 'true'),
});

export type EnvConfig = z.infer<typeof envSchema>;
