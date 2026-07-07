# Kế Hoạch Migration: uc-cross-border → NestJS + Next.js

> **Mục tiêu:** Chuyển toàn bộ JavaScript (Express.js + React/Vite) sang TypeScript/NestJS + Next.js để phù hợp với infrastructure của dự án uctalent.
>
> **Phương án:** Giữ uc-cross-border là **NestJS service độc lập** — gọi qua API như hiện tại (Sep31Adapter → BUSINESS_SERVER_URL), không tích hợp thẳng vào monorepo uctalent, vì có lifecycle riêng (blockchain polling, queue processing) và cần scale độc lập.
>
> **Phạm vi:**
> - `disbursement-bridge/` (Express/JS) → `apps/api` + `apps/worker` (NestJS/TS)
> - `uctalent-disbursement-demo/` (React/Vite/JSX) → `frontend/` (Next.js/TSX)
> - `soroban/` (Rust contracts) → **GIỮ NGUYÊN**
>
> **Tổng số file cần migrate:** ~19 JS files → ~60+ TS files

---

## Kiến trúc mục tiêu (tổng quan)

```
uc-cross-border/
├── apps/
│   ├── api/                          # NestJS REST API (@uc/api)
│   │   └── src/
│   │       ├── main.ts
│   │       ├── app.module.ts
│   │       └── modules/
│   │           ├── sep31/            # SEP-31 Anchor: info, transactions, disburse
│   │           ├── rate/             # Exchange rate oracle endpoint
│   │           ├── kyc/              # KYC resolution endpoint
│   │           ├── ipn/              # 9Pay IPN callback receiver
│   │           └── health/           # Health check
│   └── worker/                       # NestJS Background Worker (@uc/worker)
│       └── src/
│           ├── main.ts               # Standalone (no HTTP)
│           ├── app.module.ts
│           └── modules/
│               ├── soroban-listener/ # Poll Soroban events from Stellar
│               └── disbursement/     # Queue consumer + retry poller
│
├── packages/
│   ├── core/                         # @uc/core — shared entities, repos, DI symbols
│   ├── banking/                      # @uc/banking — 9Pay, bank vault, oracle
│   └── stellar/                      # @uc/stellar — Stellar SDK, SEP-31, Soroban RPC
│
├── frontend/                         # Next.js 14 + TypeScript
│   └── src/
│       ├── app/                      # App Router pages
│       ├── components/               # Shared UI components
│       ├── hooks/                    # Custom React hooks
│       └── lib/                      # Stellar SDK wrappers, constants
│
├── soroban/                          # Rust contracts (KHÔNG THAY ĐỔI)
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── .prettierrc
├── eslint.config.mjs
├── Dockerfile
├── docker-compose.yml
└── package.json
```

---

## Phase 0: Chuẩn bị

### 0.1 Kiểm tra môi trường

```bash
node --version          # >= 20 (NestJS 10 cần Node 18+)
pnpm --version          # >= 9
git status              # Working tree sạch
git log --oneline -5    # Biết commit hiện tại
```

### 0.2 Backup code cũ

```bash
mkdir -p .backup
cp -r disbursement-bridge/ .backup/disbursement-bridge/
cp -r uctalent-disbursement-demo/ .backup/uctalent-disbursement-demo/
```

### 0.3 File mapping reference (JS ↔ TS)

| File JS gốc | Dòng | File TS đích (1) | File TS đích (2) |
|---|---|---|---|
| `disbursement-bridge/src/sep31-anchor.js` | 1044 | `@uc/api` → `Sep31Controller` | `@uc/stellar` → `Sep31TransactionService` |
| | | `@uc/banking` → `NinePayGatewayService` | `@uc/banking` → `OracleService` |
| | | `@uc/banking` → `BankVaultService` | `@uc/api` → `IpnController` |
| | | `@uc/core` → `WebhookService` | `@uc/core` → `Transaction` entity |
| `disbursement-bridge/src/listener.js` | 289 | `@uc/worker` → `SorobanListenerService` | `@uc/worker` → `EventConsumerService` |
| | | `@uc/stellar` → `AnchorRpcService` | `@uc/stellar` → `StellarService` |
| | | `@uc/core` → `EventQueue` entity | |
| `disbursement-bridge/src/ninepay-client.js` | 288 | `@uc/banking` → `NinePayGatewayService` | |
| `disbursement-bridge/src/index.js` | 12 | `apps/api/src/main.ts` | `apps/worker/src/main.ts` |
| `uctalent-disbursement-demo/src/App.jsx` | 1200+ | 10+ TSX components (xem Phase 4) | |
| `uctalent-disbursement-demo/src/main.jsx` | 20 | `frontend/src/app/layout.tsx` | |

---

## Phase 1: Setup NestJS monorepo + TypeScript infrastructure

### Bước 1.1 — Init pnpm workspace

Tại thư mục root `uc-cross-border/`:

**`package.json`** (root workspace):
```json
{
  "name": "uc-cross-border",
  "private": true,
  "version": "1.0.0",
  "description": "UC Cross-Border — SEP-31 Anchor + 9Pay Disbursement Gateway",
  "scripts": {
    "dev:api": "pnpm --filter @uc/api dev",
    "dev:worker": "pnpm --filter @uc/worker dev",
    "dev:frontend": "pnpm --filter @uc/frontend dev",
    "build": "pnpm -r build",
    "build:api": "pnpm --filter @uc/api build",
    "build:worker": "pnpm --filter @uc/worker build",
    "lint": "pnpm -r lint",
    "typecheck": "pnpm -r typecheck",
    "test": "pnpm -r test",
    "test:api": "pnpm --filter @uc/api test",
    "start:prod": "node apps/api/dist/main.js"
  },
  "engines": {
    "node": ">=20.0.0",
    "pnpm": ">=9.0.0"
  }
}
```

**`pnpm-workspace.yaml`**:
```yaml
packages:
  - "apps/*"
  - "packages/*"
  - "frontend"
```

```bash
pnpm install
```

### Bước 1.2 — Base TypeScript config

**`tsconfig.base.json`** (giống hệt uctalent backend):
```json
{
  "compilerOptions": {
    "module": "commonjs",
    "target": "ES2020",
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "allowSyntheticDefaultImports": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "sourceMap": true,
    "declaration": true,
    "skipLibCheck": true,
    "strictNullChecks": false,
    "noImplicitAny": false,
    "strictBindCallApply": false,
    "forceConsistentCasingInFileNames": false,
    "noFallthroughCasesInSwitch": false
  }
}
```

### Bước 1.3 — Create `apps/api` (NestJS REST API)

```
apps/api/
├── nest-cli.json
├── .swcrc
├── tsconfig.json
├── tsconfig.build.json
├── package.json
└── src/
    ├── main.ts
    ├── app.module.ts
    └── modules/
        ├── sep31/        (thêm dần)
        ├── rate/
        ├── kyc/
        ├── ipn/
        └── health/
```

**`apps/api/package.json`**:
```json
{
  "name": "@uc/api",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "nest start --watch -b swc",
    "build": "nest build -b swc",
    "start:prod": "node dist/main.js",
    "lint": "eslint \"src/**/*.ts\" --fix",
    "typecheck": "tsc --noEmit",
    "test": "jest --config jest.config.ts"
  },
  "dependencies": {
    "@nestjs/core": "^10.4.15",
    "@nestjs/common": "^10.4.15",
    "@nestjs/platform-express": "^10.4.15",
    "@nestjs/config": "^3.3.0",
    "@nestjs/swagger": "^7.4.2",
    "@nestjs/typeorm": "^10.0.2",
    "typeorm": "^0.3.20",
    "pg": "^8.13.0",
    "@uc/core": "workspace:*",
    "@uc/banking": "workspace:*",
    "@uc/stellar": "workspace:*",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.1",
    "zod": "^3.23.0",
    "class-validator": "^0.14.1",
    "class-transformer": "^0.5.1"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "@types/node": "^20.14.0",
    "ts-node": "^10.9.2",
    "jest": "^29.7.0",
    "@nestjs/testing": "^10.4.15",
    "supertest": "^7.0.0",
    "@types/supertest": "^6.0.2"
  }
}
```

**`apps/api/nest-cli.json`**:
```json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": {
    "builder": "swc",
    "typeCheck": false,
    "assets": []
  }
}
```

**`apps/api/.swcrc`**:
```json
{
  "$schema": "https://json.schemastore.org/swcrc",
  "jsc": {
    "target": "es2020",
    "parser": {
      "syntax": "typescript",
      "decorators": true
    },
    "keepClassNames": true,
    "baseUrl": ".",
    "paths": {
      "@uc/core": ["../../packages/core/src"],
      "@uc/banking": ["../../packages/banking/src"],
      "@uc/stellar": ["../../packages/stellar/src"]
    }
  },
  "sourceMaps": true,
  "module": {
    "type": "commonjs"
  }
}
```

**`apps/api/tsconfig.json`**:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "baseUrl": "./",
    "paths": {
      "@uc/core": ["../../packages/core/src"],
      "@uc/banking": ["../../packages/banking/src"],
      "@uc/stellar": ["../../packages/stellar/src"]
    }
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**`apps/api/src/main.ts`** — Bootstrap đầy đủ:

```typescript
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');

  // ── CORS ──────────────────────────────────────────────────────────
  app.enableCors({
    origin: process.env.CORS_ORIGIN || '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  // ── Global prefix ─────────────────────────────────────────────────
  app.setGlobalPrefix('api');

  // ── Validation pipe ──────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // ── Swagger docs ────────────────────────────────────────────────
  const config = new DocumentBuilder()
    .setTitle('UC Cross-Border API')
    .setDescription('SEP-31 Anchor + 9Pay Disbursement Gateway')
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  // ── Start ────────────────────────────────────────────────────────
  const port = parseInt(process.env.ANCHOR_PORT || '4000', 10);
  await app.listen(port);
  logger.log(`API running on http://localhost:${port}`);
  logger.log(`Swagger docs at http://localhost:${port}/api/docs`);
}
bootstrap();
```

**`apps/api/src/app.module.ts`** — Root module:

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Sep31Module } from './modules/sep31/sep31.module';
import { RateModule } from './modules/rate/rate.module';
import { KycModule } from './modules/kyc/kyc.module';
import { IpnModule } from './modules/ipn/ipn.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    // ── Global config ────────────────────────────────────────────
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '../../.env',
    }),

    // ── Database ────────────────────────────────────────────────
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('POSTGRES_HOST', 'localhost'),
        port: config.get<number>('POSTGRES_PORT', 15432),
        username: config.get<string>('POSTGRES_USER', 'uct_rails_dev_root'),
        password: config.get<string>('POSTGRES_PASSWORD'),
        database: config.get<string>('POSTGRES_DB', 'uct_cross_border_dev'),
        autoLoadEntities: true,
        synchronize: config.get<string>('NODE_ENV') !== 'production',
        logging: config.get<string>('NODE_ENV') === 'local' ? ['error', 'warn'] : false,
      }),
    }),

    // ── Feature modules ─────────────────────────────────────────
    Sep31Module,
    RateModule,
    KycModule,
    IpnModule,
    HealthModule,
  ],
})
export class AppModule {}
```

### Bước 1.4 — Create `apps/worker` (NestJS standalone)

```
apps/worker/
├── tsconfig.json
├── package.json
└── src/
    ├── main.ts
    ├── app.module.ts
    └── modules/
        ├── soroban-listener/
        └── disbursement/
```

**`apps/worker/package.json`**:
```json
{
  "name": "@uc/worker",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "nest start --watch -b swc",
    "build": "nest build -b swc",
    "start:prod": "node dist/main.js",
    "lint": "eslint \"src/**/*.ts\" --fix",
    "typecheck": "tsc --noEmit",
    "test": "jest --config jest.config.ts"
  },
  "dependencies": {
    "@nestjs/core": "^10.4.15",
    "@nestjs/common": "^10.4.15",
    "@nestjs/config": "^3.3.0",
    "@nestjs/schedule": "^4.1.0",
    "@nestjs/typeorm": "^10.0.2",
    "typeorm": "^0.3.20",
    "pg": "^8.13.0",
    "@uc/core": "workspace:*",
    "@uc/stellar": "workspace:*",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.1"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "@types/node": "^20.14.0",
    "ts-node": "^10.9.2"
  }
}
```

**`apps/worker/src/main.ts`** — Standalone NestJS app (không HTTP):

```typescript
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Worker');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'error', 'warn', 'debug', 'verbose'],
  });

  app.enableShutdownHooks();

  logger.log('Worker started — polling Soroban events...');
  logger.log(`RPC URL: ${process.env.SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org'}`);
  logger.log(`Poll interval: ${process.env.POLL_INTERVAL_MS || 5000}ms`);

  // Handle graceful shutdown
  process.on('SIGTERM', async () => {
    logger.log('SIGTERM received — shutting down...');
    await app.close();
  });
  process.on('SIGINT', async () => {
    logger.log('SIGINT received — shutting down...');
    await app.close();
  });
}
bootstrap();
```

**`apps/worker/src/app.module.ts`**:
```typescript
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SorobanListenerModule } from './modules/soroban-listener/soroban-listener.module';
import { DisbursementModule } from './modules/disbursement/disbursement.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '../../.env' }),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('POSTGRES_HOST', 'localhost'),
        port: config.get<number>('POSTGRES_PORT', 15432),
        username: config.get<string>('POSTGRES_USER', 'uct_rails_dev_root'),
        password: config.get<string>('POSTGRES_PASSWORD'),
        database: config.get<string>('POSTGRES_DB', 'uct_cross_border_dev'),
        autoLoadEntities: true,
        synchronize: config.get<string>('NODE_ENV') !== 'production',
      }),
    }),
    SorobanListenerModule,
    DisbursementModule,
  ],
})
export class AppModule {}
```

### Bước 1.5 — Create packages

**`packages/core/package.json`**:
```json
{
  "name": "@uc/core",
  "version": "1.0.0",
  "private": true,
  "main": "src/index.ts",
  "types": "src/index.ts",
  "dependencies": {
    "typeorm": "^0.3.20",
    "pg": "^8.13.0",
    "uuid": "^10.0.0",
    "zod": "^3.23.0",
    "axios": "^1.7.0"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "@types/uuid": "^10.0.0",
    "@types/node": "^20.14.0"
  }
}
```

**`packages/core/tsconfig.json`**:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "declarationMap": true
  },
  "include": ["src/**/*"]
}
```

**`packages/core/src/index.ts`** — Barrel exports:
```typescript
export * from './db/entities/base.entity';
export * from './db/entities/transaction.entity';
export * from './db/entities/event-queue.entity';
export * from './constants/di-symbols';
export * from './services/webhook.service';
export * from './config/env.config';
```

**`packages/banking/package.json`**:
```json
{
  "name": "@uc/banking",
  "version": "1.0.0",
  "private": true,
  "main": "src/index.ts",
  "types": "src/index.ts",
  "dependencies": {
    "@nestjs/common": "^10.4.15",
    "axios": "^1.7.0",
    "@uc/core": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "@nestjs/testing": "^10.4.15"
  }
}
```

**`packages/stellar/package.json`**:
```json
{
  "name": "@uc/stellar",
  "version": "1.0.0",
  "private": true,
  "main": "src/index.ts",
  "types": "src/index.ts",
  "dependencies": {
    "@nestjs/common": "^10.4.15",
    "@stellar/stellar-sdk": "^13.0.0",
    "axios": "^1.7.0",
    "@uc/core": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "@types/node": "^20.14.0"
  }
}
```

### Bước 1.6 — ESLint + Prettier

**`.prettierrc`** (giống uctalent):
```json
{
  "singleQuote": true,
  "trailingComma": "es5",
  "printWidth": 80,
  "tabWidth": 2,
  "semi": true,
  "bracketSpacing": true,
  "arrowParens": "always",
  "endOfLine": "lf"
}
```

**`.eslintrc.js`** (match uctalent's rules):
```javascript
module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: 'tsconfig.json',
    tsconfigRootDir: __dirname,
    sourceType: 'module',
  },
  plugins: [
    '@typescript-eslint/eslint-plugin',
    'simple-import-sort',
    'import',
    'unused-imports',
  ],
  extends: [
    'plugin:@typescript-eslint/recommended',
    'plugin:prettier/recommended',
  ],
  root: true,
  env: {
    node: true,
    jest: true,
  },
  ignorePatterns: ['.eslintrc.js', 'dist', 'node_modules'],
  rules: {
    '@typescript-eslint/consistent-type-imports': 'error',
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-unused-vars': 'off',
    'simple-import-sort/imports': [
      'error',
      {
        groups: [
          // NestJS + npm packages
          ['^@nestjs', '^@?\\w'],
          // Internal workspace packages
          ['^@uc'],
          // Parent imports
          ['^\\.\\.(?!/?$)', '^\\.\\./?$'],
          // Same-folder imports
          ['^\\./(?=.*/)(?!/?$)', '^\\.(?!/?$)', '^\\./?$'],
        ],
      },
    ],
    'simple-import-sort/exports': 'error',
    'unused-imports/no-unused-imports': 'error',
  },
};
```

**`.eslintignore`**:
```
dist
node_modules
*.js
!*.config.js
```

### Bước 1.7 — Shared environment config

**`packages/core/src/config/env.config.ts`**:
```typescript
import { z } from 'zod';

/**
 * Zod validation schema cho tất cả environment variables.
 * Pattern này giống hệt uctalent's EnvService + envSchema.
 */
export const envSchema = z.object({
  // ── General ──────────────────────────────────────────────
  NODE_ENV: z.enum(['local', 'development', 'production']).default('local'),

  // ── API ────────────────────────────────────────────────────
  ANCHOR_PORT: z.coerce.number().default(4000),

  // ── Stellar / Soroban ─────────────────────────────────────
  SOROBAN_RPC_URL: z.string().default('https://soroban-testnet.stellar.org'),
  ESCROW_CONTRACT_ID: z.string().optional(),
  NETWORK_PASSPHRASE: z.string().default('Test SDF Network ; September 2015'),
  USDC_ISSUER: z
    .string()
    .default('GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5'),
  TOKEN_DECIMALS: z.coerce.number().default(7),

  // ── Security ──────────────────────────────────────────────
  WEBHOOK_SECRET: z.string().default('uctalent-dev-secret'),
  ALLOWED_WEBHOOK_IPS: z.string().default('127.0.0.1,::1,::ffff:127.0.0.1'),

  // ── Listener ──────────────────────────────────────────────
  POLL_INTERVAL_MS: z.coerce.number().default(5000),
  PROCESS_INTERVAL_MS: z.coerce.number().default(2000),

  // ── 9Pay ──────────────────────────────────────────────────
  NINEPAY_BASE_URL: z
    .string()
    .default('https://sand-payment.9pay.vn'),
  NINEPAY_MERCHANT_KEY: z.string().optional(),
  NINEPAY_SECRET_KEY: z.string().optional(),
  NINEPAY_CHECKSUM_KEY: z.string().optional(),

  // ── PostgreSQL ────────────────────────────────────────────
  POSTGRES_HOST: z.string().default('localhost'),
  POSTGRES_PORT: z.coerce.number().default(15432),
  POSTGRES_USER: z.string().default('uct_rails_dev_root'),
  POSTGRES_PASSWORD: z.string().default(''),
  POSTGRES_DB: z.string().default('uct_cross_border_dev'),

  // ── UCTalent Backend ──────────────────────────────────────
  UCTALENT_BACKEND_WEBHOOK_URL: z
    .string()
    .default('http://localhost:3000/api/v2/cross-border/settlement-callback'),

  // ── Platform Treasury ─────────────────────────────────────
  PLATFORM_TREASURY_ADDRESS: z.string().optional(),
  PLATFORM_BANK_CODE: z.string().default('BIDV'),
  PLATFORM_ACCOUNT_NUMBER: z.string().default('96311300000170179'),
  PLATFORM_ACCOUNT_NAME: z.string().default('UCTALENT PLATFORM'),

  // ── Oracle ─────────────────────────────────────────────────
  ORACLE_MODE: z.enum(['mock', 'live']).default('mock'),
  ORACLE_FALLBACK_RATE: z.coerce.number().default(25450),
  ORACLE_HARD_BOUND_MIN: z.coerce.number().default(23000),
  ORACLE_HARD_BOUND_MAX: z.coerce.number().default(26500),
  ORACLE_SAFETY_SPREAD: z.coerce.number().default(0.99),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): EnvConfig {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    console.error('❌ Environment validation failed:');
    for (const issue of result.error.issues) {
      console.error(`   - ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
  }
  return result.data;
}
```

### Bước 1.8 — Verify setup

```bash
# Install tất cả dependencies
pnpm install

# Build packages (core → banking/stellar → apps)
pnpm --filter @uc/core build
pnpm --filter @uc/stellar build
pnpm --filter @uc/banking build

# Start API để verify
pnpm dev:api
# → http://localhost:4000/api/docs (Swagger)
# → http://localhost:4000/health

# Start Worker
pnpm dev:worker
# → "Worker started — polling Soroban events..."
```

---

## Phase 2: Migrate backend business logic → NestJS Packages

### Bước 2.1 — `@uc/stellar` package (Stellar/Soroban services)

#### Tạo cấu trúc thư mục

```
packages/stellar/src/
├── index.ts
├── services/
│   ├── stellar.service.ts
│   ├── sep31-transaction.service.ts
│   └── anchor-rpc.service.ts
└── interfaces/
    ├── stellar.interface.ts
    ├── sep31.interface.ts
    └── soroban-event.interface.ts
```

#### `stellar.service.ts` — Helper functions

Chuyển từ `listener.js` (lines 3-74) và `sep31-anchor.js` (lines 33-43):

```typescript
import { Injectable } from '@nestjs/common';
import { xdr, scValToNative } from '@stellar/stellar-sdk';
import * as crypto from 'crypto';

@Injectable()
export class StellarService {
  /**
   * Decode Soroban SCVal từ XDR base64 string hoặc ScVal object.
   * Từ listener.js: function toNative(scValOrBase64)
   */
  toNative(scValOrBase64: any): any {
    try {
      let scVal = scValOrBase64;
      if (typeof scVal === 'string') {
        scVal = xdr.ScVal.fromXDR(scVal, 'base64');
      } else if (scVal && (scVal as any).xdr) {
        scVal = xdr.ScVal.fromXDR((scVal as any).xdr, 'base64');
      }
      return scValToNative(scVal);
    } catch {
      return null;
    }
  }

  /**
   * Convert i128 (stroops) → USDC decimal.
   * Từ listener.js: function stroopsToUsdc(stroops)
   */
  stroopsToUsdc(stroops: number, decimals: number = 7): number {
    return Number(BigInt(stroops || 0)) / Math.pow(10, decimals);
  }

  /**
   * Generate SHA-256 hash cho recipient (on-chain proof).
   * Từ sep31-anchor.js: function generateRecipientHash(...)
   */
  generateRecipientHash(
    bankCode: string,
    accountNumber: string,
    accountName: string,
  ): string {
    const data = `${bankCode}${accountNumber}${accountName}`;
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Log on-chain event (audit trail).
   * Từ sep31-anchor.js: function emitOnChainEvent(...)
   */
  emitOnChainEvent(eventName: string, payload: Record<string, any>): void {
    console.log(`\n🔗 [ON-CHAIN EVENT] ${eventName}`);
    for (const [k, v] of Object.entries(payload)) {
      console.log(`   ${k.padEnd(16)}: ${v}`);
    }
  }
}
```

#### `sep31-transaction.service.ts` — Transaction CRUD

Chuyển từ `sep31-anchor.js` (lines 67-147, 284-427, 969-993):

```typescript
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Transaction } from '@uc/core';
import * as crypto from 'crypto';

export interface CreateSep31TransactionDto {
  amount: number;
  assetCode: string;
  assetIssuer?: string;
  receiverId: string;
  senderId?: string;
  fields: {
    routingNumber: string;
    accountNumber: string;
    bankCode: string;
    accountName: string;
    memo?: string;
  };
}

export interface Sep31TransactionResponse {
  id: string;
  status: string;
  status_eta: number;
  amount_in: string;
  amount_in_asset: string;
  amount_fee: string;
  amount_fee_asset: string;
  amount_out: string;
  amount_out_asset: string;
  stellar_account_id: string;
  stellar_memo_type: string;
  stellar_memo: string;
  started_at: string;
  updated_at: string;
  completed_at: string | null;
}

@Injectable()
export class Sep31TransactionService {
  private readonly logger = new Logger(Sep31TransactionService.name);
  private readonly usdcIssuer: string;
  private readonly fallbackRate = 25450;
  private readonly feeFixed = 0.5;

  constructor(
    @InjectRepository(Transaction)
    private readonly txRepo: Repository<Transaction>,
  ) {
    this.usdcIssuer =
      process.env.USDC_ISSUER ||
      'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
  }

  /**
   * Tạo SEP-31 transaction mới.
   * Từ sep31-anchor.js: POST /sep31/transactions handler (lines 284-380)
   */
  async createTransaction(dto: CreateSep31TransactionDto): Promise<{ id: string }> {
    const txId = crypto.randomUUID();
    const now = new Date().toISOString();

    const amountIn = dto.amount;
    const amountFee = this.feeFixed;
    const amountOut = amountIn - amountFee;
    const amountOutVnd = Math.round(amountOut * this.fallbackRate);

    // Lưu data dạng JSONB cho backward compatibility
    const data: Record<string, any> = {
      id: txId,
      status: 'pending_sender',
      status_eta: 60,
      kind: 'receive',
      amount_in: `${amountIn.toFixed(7)}`,
      amount_in_asset: `stellar:USDC:${this.usdcIssuer}`,
      amount_fee: `${amountFee.toFixed(7)}`,
      amount_fee_asset: `stellar:USDC:${this.usdcIssuer}`,
      amount_out: `${amountOut.toFixed(7)}`,
      amount_out_asset: 'iso4217:VND',
      stellar_memo_type: 'text',
      stellar_memo: txId.replace(/-/g, '').substring(0, 28),
      started_at: now,
      updated_at: now,
      completed_at: null,
      _uctalent: {
        receiver_id: dto.receiverId,
        sender_id: dto.senderId || null,
        routing_number: dto.fields.routingNumber,
        bank_code: dto.fields.bankCode,
        account_number: dto.fields.accountNumber,
        account_name: dto.fields.accountName,
        memo: dto.fields.memo || '',
        fx_rate: this.fallbackRate,
        amount_out_vnd: amountOutVnd,
        mock_payout_status: null,
      },
    };

    await this.txRepo.save({
      id: txId,
      stellarMemo: data.stellar_memo,
      kind: 'receive',
      data,
      status: 'pending_sender',
    });

    this.logger.log(`New SEP-31 transaction created: ${txId}`);
    this.logger.log(`  Amount IN: ${amountIn} USDC → OUT: ${amountOutVnd.toLocaleString()} VND`);

    return { id: txId };
  }

  /**
   * Lấy transaction theo ID.
   * Từ sep31-anchor.js: function getTransactionById(id)
   */
  async getById(id: string): Promise<Transaction | null> {
    return this.txRepo.findOne({ where: { id } });
  }

  /**
   * Lấy SEP-31 receive transaction theo stellar memo.
   * Từ sep31-anchor.js: function getSep31TransactionByMemo(memo)
   */
  async getByMemo(memo: string): Promise<Transaction | null> {
    return this.txRepo.findOne({
      where: { stellarMemo: memo, kind: 'receive' },
    });
  }

  /**
   * Lấy tất cả split transactions theo stellar tx hash.
   * Từ sep31-anchor.js: function getSplitsByStellarTxHash(txHash)
   */
  async getByStellarTxHash(txHash: string): Promise<Transaction[]> {
    return this.txRepo.find({
      where: { stellarTxHash: txHash, kind: null as any },
    });
  }

  /**
   * Lấy sibling splits theo stellar memo.
   * Từ sep31-anchor.js: function getSiblingsByStellarMemo(memo)
   */
  async getSiblingsByMemo(memo: string): Promise<Transaction[]> {
    return this.txRepo.find({
      where: { stellarMemo: memo, kind: null as any },
    });
  }

  /**
   * Update transaction status.
   * Từ sep31-anchor.js: saveTransaction calls
   */
  async updateStatus(id: string, status: string): Promise<void> {
    const tx = await this.getById(id);
    if (!tx) return;
    const data = tx.data || {};
    data.status = status;
    data.updated_at = new Date().toISOString();
    await this.txRepo.update(id, {
      status,
      data,
    });
  }

  /**
   * Build SEP-31 compliant response (chỉ fields public).
   * Từ sep31-anchor.js: function buildTransactionResponse(tx) (lines 969-993)
   */
  buildTransactionResponse(tx: Transaction): Sep31TransactionResponse {
    const data = tx.data || {};
    return {
      id: tx.id,
      status: tx.status || data.status || 'unknown',
      status_eta: 3600,
      amount_in: data.amount_in || '0',
      amount_in_asset: data.amount_in_asset || `stellar:USDC:${this.usdcIssuer}`,
      amount_fee: data.amount_fee || '0',
      amount_fee_asset: data.amount_fee_asset || `stellar:USDC:${this.usdcIssuer}`,
      amount_out: data.amount_out || '0',
      amount_out_asset: 'iso4217:VND',
      stellar_account_id: process.env.ANCHOR_PUBLIC_KEY || '',
      stellar_memo_type: 'text',
      stellar_memo: tx.stellarMemo || '',
      started_at: data.started_at || tx.createdAt.toISOString(),
      updated_at: data.updated_at || tx.updatedAt.toISOString(),
      completed_at: data.completed_at || null,
    };
  }
}
```

#### `anchor-rpc.service.ts` — Soroban RPC client

Chuyển từ `listener.js` (lines 94-174, 496-506):

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { rpc } from '@stellar/stellar-sdk';

export interface SorobanEvent {
  txHash: string;
  ledger: number;
  contractId: string;
  topic: any[];
  value: any;
}

@Injectable()
export class AnchorRpcService {
  private readonly logger = new Logger(AnchorRpcService.name);
  private readonly rpcServer: rpc.Server;

  constructor() {
    const rpcUrl =
      process.env.SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org';
    this.rpcServer = new rpc.Server(rpcUrl);
  }

  /**
   * Lấy latest ledger sequence.
   */
  async getLatestLedger(): Promise<number> {
    const status = await this.rpcServer.getLatestLedger();
    return status.sequence;
  }

  /**
   * Get events từ Soroban RPC.
   * Từ listener.js: pollSorobanEvents → rpcServer.getEvents(...)
   */
  async getEvents(
    startLedger: number,
    filters: Array<{ type: string; contractIds: string[] }>,
    limit: number = 100,
  ): Promise<SorobanEvent[]> {
    try {
      const response = await this.rpcServer.getEvents({
        startLedger,
        filters,
        limit,
      });
      return (response?.events || []).map((ev: any) => ({
        txHash: ev.txHash,
        ledger: ev.ledger,
        contractId: ev.contractId?.toString() || '',
        topic: ev.topic || [],
        value: ev.value,
      }));
    } catch (err: any) {
      this.logger.error(`Failed to get events: ${err.message}`);
      return [];
    }
  }

  /**
   * Get transaction status từ Soroban RPC.
   * Từ sep31-anchor.js: rpcServer.getTransaction(payload.stellarTxHash) (lines 494-506)
   */
  async getTransaction(txHash: string): Promise<{ status: string; result?: any }> {
    try {
      const result = await this.rpcServer.getTransaction(txHash);
      return {
        status: result.status,
        result: result.status === 'SUCCESS' ? result : undefined,
      };
    } catch (err: any) {
      this.logger.error(`Failed to get transaction ${txHash}: ${err.message}`);
      return { status: 'NOT_FOUND' };
    }
  }

  /**
   * Verify giao dịch trên-chain.
   * Từ sep31-anchor.js: verification block (lines 494-506)
   */
  async verifyOnChainTransaction(txHash: string): Promise<boolean> {
    const txStatus = await this.getTransaction(txHash);
    const isValid = txStatus.status === 'SUCCESS';
    if (isValid) {
      this.logger.log(`✅ On-chain TX ${txHash} confirmed SUCCESS`);
    } else {
      this.logger.warn(`⚠️ On-chain TX ${txHash} status: ${txStatus.status}`);
    }
    return isValid;
  }
}
```

#### `index.ts` (barrel export):

```typescript
export { StellarService } from './services/stellar.service';
export { Sep31TransactionService, CreateSep31TransactionDto, Sep31TransactionResponse } from './services/sep31-transaction.service';
export { AnchorRpcService, SorobanEvent } from './services/anchor-rpc.service';
```

### Bước 2.2 — `@uc/banking` package (Banking/9Pay services)

#### Tạo cấu trúc thư mục

```
packages/banking/src/
├── index.ts
└── services/
    ├── ninepay-gateway.service.ts
    ├── ninepay-mock.service.ts
    ├── oracle.service.ts
    └── bank-vault.service.ts
```

#### `ninepay-gateway.service.ts` — 9Pay API client

Chuyển từ `ninepay-client.js` (full file, 288 lines):

```typescript
import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import * as crypto from 'crypto';

export interface NinePayConfig {
  merchantKey: string;
  secretKey: string;
  checksumKey: string;
  baseUrl: string;
}

export interface VerifyAccountParams {
  requestId: string;
  bankCode: string;
  accountNo: string;
  accountType?: string;
}

export interface TransferParams {
  requestId: string;
  amount: number;
  description: string;
  bankCode: string;
  accountName: string;
  accountNo: string;
  accountType?: string;
}

export interface IpnVerificationResult {
  valid: boolean;
  data: Record<string, any> | null;
}

@Injectable()
export class NinePayGatewayService {
  private readonly logger = new Logger(NinePayGatewayService.name);
  private readonly http: AxiosInstance;
  private readonly config: NinePayConfig;

  constructor(config: NinePayConfig) {
    this.config = config;
    this.http = axios.create({
      baseURL: config.baseUrl.replace(/\/+$/, ''),
      timeout: 15000,
      headers: { 'Content-Type': 'application/json' },
    });
    this.logger.log(`Initialized for merchant ${config.merchantKey} → ${config.baseUrl}`);
  }

  // ── Signature helpers (từ ninepay-client.js lines 57-121) ──────────

  private buildHttpQuery(params: Record<string, any>): string {
    if (!params || Object.keys(params).length === 0) return '';
    return Object.keys(params)
      .sort()
      .map((key) => {
        return encodeURIComponent(key) + '=' + encodeURIComponent(String(params[key]));
      })
      .join('&')
      .replace(/%20/g, '+');
  }

  private createSignature(method: string, path: string, time: string, params: Record<string, any>): string {
    const httpQuery = this.buildHttpQuery(params);
    let message = method.toUpperCase() + '\n' + this.config.baseUrl.replace(/\/+$/, '') + path + '\n' + time;
    if (httpQuery) message += '\n' + httpQuery;
    return crypto.createHmac('sha256', this.config.secretKey).update(message, 'utf8').digest('base64');
  }

  private buildAuthHeader(signature: string): string {
    return `Signature Algorithm=HS256,Credential=${this.config.merchantKey},SignedHeaders=,Signature=${signature}`;
  }

  private async request(method: string, path: string, params: Record<string, any> = {}): Promise<any> {
    const time = Math.round(Date.now() / 1000).toString();
    const signature = this.createSignature(method, path, time, params);
    const authHeader = this.buildAuthHeader(signature);

    const config: Record<string, any> = {
      method,
      url: path,
      headers: {
        Authorization: authHeader,
        Date: time,
        'Content-Type': method.toUpperCase() === 'POST' ? 'application/x-www-form-urlencoded' : 'application/json',
      },
    };

    if (method.toUpperCase() === 'GET') {
      config.params = params;
    } else {
      config.data = new URLSearchParams(params).toString();
    }

    const response = await this.http.request(config);
    return response.data;
  }

  // ── API methods (từ ninepay-client.js lines 137-220) ──────────────

  async verifyAccount(params: VerifyAccountParams): Promise<any> {
    const reqParams = {
      request_id: params.requestId,
      bank_code: params.bankCode,
      account_no: params.accountNo,
      account_type: params.accountType || '0',
    };

    this.logger.log(`Verifying account: ${params.bankCode} / ${params.accountNo}`);

    // Mock cho E2E test 2.4.3 (từ ninepay-client.js lines 148-151)
    if (params.accountNo === '0000000000') {
      this.logger.warn('⚠️ MOCKING RETRYABLE ERROR for account 0000000000');
      return { status: 3, error_code: '1009', message: 'Dịch vụ tạm thời gián đoạn' };
    }

    const result = await this.request('POST', '/disbursement/check-account', reqParams);
    if (result.status === 5) {
      this.logger.log(`✅ Account verified: ${result.account_name}`);
    }
    return result;
  }

  async checkBalance(): Promise<any> {
    this.logger.log('Checking merchant balance...');
    const result = await this.request('GET', '/disbursement/balance', {});
    if (result.status === 5) {
      this.logger.log(`✅ Balance: ${Number(result.data).toLocaleString()} VND`);
    }
    return result;
  }

  async requestTransfer(params: TransferParams): Promise<any> {
    const reqParams = {
      request_id: params.requestId,
      amount: String(params.amount),
      description: params.description,
      bank_code: params.bankCode,
      account_name: params.accountName,
      account_no: params.accountNo,
      account_type: params.accountType || '0',
    };

    const result = await this.request('POST', '/disbursement/create', reqParams);
    if (result.status === 2 || result.status === 5) {
      this.logger.log(`✅ Transfer accepted — payment_no: ${result.payment_no}`);
    }
    return result;
  }

  // ── IPN verification (từ ninepay-client.js lines 236-260) ────────

  verifyIpnCallback(resultB64: string, checksum: string): IpnVerificationResult {
    const computedChecksum = crypto
      .createHash('sha256')
      .update(resultB64 + this.config.checksumKey)
      .digest('hex')
      .toUpperCase();

    if (computedChecksum !== checksum.toUpperCase()) {
      this.logger.warn('❌ IPN checksum mismatch');
      return { valid: false, data: null };
    }

    try {
      const decoded = JSON.parse(Buffer.from(resultB64, 'base64').toString('utf8'));
      this.logger.log(`✅ IPN verified — status: ${decoded.status}`);
      return { valid: true, data: decoded };
    } catch (err: any) {
      this.logger.error(`❌ Failed to decode IPN result: ${err.message}`);
      return { valid: false, data: null };
    }
  }

  // ── Error codes (từ ninepay-client.js lines 268-285) ─────────────

  static getErrorMessage(errorCode: string): string {
    const errors: Record<string, string> = {
      '000': 'Thành công',
      '431': 'Số dư Merchant không đủ — nạp thêm VND vào tài khoản 9Pay',
      '1001': 'Không tìm thấy thông tin tài khoản',
      '1002': 'Thông tin xác thực không hợp lệ',
      '1004': 'Thông tin tài khoản ngân hàng không hợp lệ',
      '1005': 'Dịch vụ chưa kích hoạt — liên hệ 9Pay',
      '1006': 'Không tìm thấy thông tin ngân hàng',
      '1007': 'Vượt hạn mức (2,000 — 2,000,000,000 VND)',
      '1008': 'Tên tài khoản không hợp lệ',
      '1009': 'Dịch vụ tạm thời gián đoạn',
      '1010': 'Ngân hàng đang bảo trì',
      '1011': 'Dịch vụ chuyển khoản tạm gián đoạn',
      '1012': 'Tên người thụ hưởng không hợp lệ',
    };
    return errors[errorCode] || `Lỗi không xác định (${errorCode})`;
  }
}
```

#### `ninepay-mock.service.ts` — Mock fallback

Chuyển từ `sep31-anchor.js` (`simulateLocalCallback`, `fallbackToLocalSimulation` — lines 791-846):

```typescript
import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import * as http from 'http';

@Injectable()
export class NinePayMockService {
  private readonly logger = new Logger(NinePayMockService.name);

  /**
   * Mô phỏng clearing callback (từ sep31-anchor.js simulateLocalCallback).
   * Tạo mock IPN payload và POST tới /api/9pay/callback local.
   */
  simulateClearing(tx: { clearingId: string; paymentNo?: string; amountVnd: number; bankCode: string; bankAccount: string; accountName: string }): void {
    const mockBankRef = `FT${Math.floor(10_000_000_000 + Math.random() * 90_000_000_000)}`;
    const port = process.env.ANCHOR_PORT || 4000;

    const resultData = {
      status: 5,
      error_code: '000',
      message: 'success',
      payment_no: tx.paymentNo || `SIM${Math.floor(10_000_000 + Math.random() * 90_000_000)}`,
      request_id: tx.clearingId,
      amount: String(tx.amountVnd),
      bank_code: tx.bankCode,
      account_no: tx.bankAccount,
      account_name: tx.accountName,
      bank_ref: mockBankRef,
    };

    const resultBase64 = Buffer.from(JSON.stringify(resultData)).toString('base64');
    const checksumKey = process.env.NINEPAY_CHECKSUM_KEY || 'LODYjQRPfDL751cXHAatxlNaaBOVij9s';
    const checksum = crypto
      .createHash('sha256')
      .update(resultBase64 + checksumKey)
      .digest('hex')
      .toUpperCase();

    const formBody = `result=${encodeURIComponent(resultBase64)}&checksum=${encodeURIComponent(checksum)}&version=v1`;

    setTimeout(() => {
      const options = {
        hostname: 'localhost',
        port,
        path: '/api/9pay/callback',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(formBody),
        },
      };
      const req = http.request(options, (res) => {
        this.logger.log(`✅ SimCallback: HTTP ${res.statusCode} — ${tx.clearingId}`);
      });
      req.on('error', (e) => this.logger.error(`❌ SimCallback error: ${e.message}`));
      req.write(formBody);
      req.end();
    }, 2000);
  }

  /**
   * Fallback khi 9Pay client chưa initialized.
   * Từ sep31-anchor.js: fallbackToLocalSimulation (lines 791-801)
   */
  fallbackToLocalSimulation(tx: any): void {
    this.logger.warn('⚠️ 9Pay client not initialized. Using local simulation.');
    this.simulateClearing(tx);
  }
}
```

#### `oracle.service.ts` — Exchange rate

Chuyển từ `sep31-anchor.js` (FALLBACK_RATE, `/api/exchange-rate` — lines 77-80, 271-277):

```typescript
import { Injectable, Logger } from '@nestjs/common';

export interface ExchangeRate {
  rate: number;
  source: string;
  updatedAt: string;
}

@Injectable()
export class OracleService {
  private readonly logger = new Logger(OracleService.name);
  private readonly fallbackRate: number;
  private readonly hardBoundMin: number;
  private readonly hardBoundMax: number;

  constructor() {
    this.fallbackRate = parseInt(process.env.ORACLE_FALLBACK_RATE || '25450', 10);
    this.hardBoundMin = parseInt(process.env.ORACLE_HARD_BOUND_MIN || '23000', 10);
    this.hardBoundMax = parseInt(process.env.ORACLE_HARD_BOUND_MAX || '26500', 10);
  }

  /**
   * Lấy exchange rate USDC → VND.
   * Mode: mock → trả về fallback rate
   * Mode: live → gọi oracle on-chain (TODO)
   */
  async getRate(): Promise<ExchangeRate> {
    if (process.env.ORACLE_MODE === 'live') {
      // TODO: Call Reflector Testnet DEX Oracle (SEP-40)
      this.logger.warn('Live oracle mode not yet implemented — using fallback');
    }

    return {
      rate: this.fallbackRate,
      source: 'oracle_api',
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Validate rate không nằm ngoài hard bound.
   */
  validateRate(rate: number): boolean {
    return rate >= this.hardBoundMin && rate <= this.hardBoundMax;
  }

  /**
   * Apply safety spread để tránh slippage.
   */
  applySafetySpread(rate: number): number {
    const spread = parseFloat(process.env.ORACLE_SAFETY_SPREAD || '0.99');
    return Math.round(rate * spread);
  }
}
```

#### `bank-vault.service.ts` — KYC resolution

Chuyển từ `sep31-anchor.js` (`resolveBankDetailsFromKyc` — lines 1003-1031):

```typescript
import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

export interface BankDetails {
  bankCode: string;
  accountNumber: string;
  accountName: string;
}

@Injectable()
export class BankVaultService {
  private readonly salt: string;
  private readonly kycMockDb: Record<string, BankDetails>;

  constructor() {
    this.salt = process.env.KYC_SALT || 'uctalent-salt-2026';

    // Tính hash cho mock data (từ resolveBankDetailsFromKyc)
    const devKycHash = crypto.createHash('sha256').update('kyc_dev_001' + this.salt).digest('hex');
    const scoutKycHash = crypto.createHash('sha256').update('kyc_scout_001' + this.salt).digest('hex');

    this.kycMockDb = {
      [devKycHash]: { bankCode: 'BIDV', accountNumber: '96311300000169969', accountName: 'UCTALENT' },
      [scoutKycHash]: { bankCode: 'BIDV', accountNumber: '96311300000169969', accountName: 'UCTALENT' },
      talent: { bankCode: 'BIDV', accountNumber: '96311300000169969', accountName: 'UCTALENT' },
      scout: { bankCode: 'BIDV', accountNumber: '96311300000169969', accountName: 'UCTALENT' },
      platform: { bankCode: 'BIDV', accountNumber: '96311300000170179', accountName: 'UCTALENT1' },
    };
  }

  /**
   * Resolve bank details từ KYC ID.
   * Trong production: gọi SEP-12 KYC service.
   * Hiện tại: mock data cho testnet.
   */
  resolveBankDetails(kycId: string, party: string): BankDetails {
    if (kycId && kycId.startsWith('invalid_kyc')) {
      return { bankCode: 'TCB', accountNumber: '0000000000', accountName: 'UNKNOWN' };
    }
    return (
      this.kycMockDb[kycId] ||
      this.kycMockDb[party] ||
      { bankCode: 'TCB', accountNumber: '0000000000', accountName: 'UNKNOWN' }
    );
  }
}
```

#### `index.ts` (barrel):

```typescript
export { NinePayGatewayService, NinePayConfig, VerifyAccountParams, TransferParams } from './services/ninepay-gateway.service';
export { NinePayMockService } from './services/ninepay-mock.service';
export { OracleService, ExchangeRate } from './services/oracle.service';
export { BankVaultService, BankDetails } from './services/bank-vault.service';
```

### Bước 2.3 — `@uc/core` package (Shared domain layer)

#### Tạo cấu trúc thư mục

```
packages/core/src/
├── index.ts
├── config/
│   └── env.config.ts
├── constants/
│   └── di-symbols.ts
├── db/
│   ├── entities/
│   │   ├── base.entity.ts
│   │   ├── transaction.entity.ts
│   │   └── event-queue.entity.ts
│   └── repositories/
│       ├── transaction.repository.ts
│       └── event-queue.repository.ts
└── services/
    └── webhook.service.ts
```

#### `base.entity.ts` (match uctalent's BaseEntity):

```typescript
import { v4 as uuidv4 } from 'uuid';
import { BeforeInsert, Column, PrimaryGeneratedColumn } from 'typeorm';

export abstract class BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    name: 'created_at',
    type: 'timestamptz',
    transformer: {
      to: (value: Date) => value || new Date(),
      from: (value: Date) => value,
    },
  })
  createdAt: Date;

  @Column({
    name: 'updated_at',
    type: 'timestamptz',
    transformer: {
      to: (value: Date) => value || new Date(),
      from: (value: Date) => value,
    },
  })
  updatedAt: Date;

  @BeforeInsert()
  setDefaults(): void {
    if (!this.id) {
      this.id = uuidv4();
    }
    if (!this.createdAt) {
      this.createdAt = new Date();
    }
    if (!this.updatedAt) {
      this.updatedAt = new Date();
    }
  }
}
```

#### `transaction.entity.ts`:

```typescript
import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from './base.entity';

@Entity({ name: 'transactions' })
@Index(['stellarMemo'])
@Index(['stellarTxHash'])
@Index(['clearingId'])
export class Transaction extends BaseEntity {
  @Column({ name: 'stellar_memo', nullable: true, type: 'varchar' })
  stellarMemo: string;

  @Column({ name: 'stellar_tx_hash', nullable: true, type: 'varchar' })
  stellarTxHash: string;

  @Column({ nullable: true, type: 'varchar' })
  kind: string | null; // 'receive' | null

  @Column({ type: 'jsonb', nullable: true })
  data: Record<string, any> | null;

  @Column({ nullable: true, type: 'varchar' })
  party: string | null; // 'talent' | 'scout' | 'platform'

  @Column({ name: 'clearing_id', nullable: true, type: 'varchar' })
  clearingId: string | null;

  @Column({ nullable: true, type: 'varchar' })
  status: string | null;

  @Column({ name: 'amount_vnd', type: 'decimal', precision: 15, scale: 0, nullable: true })
  amountVnd: number | null;

  @Column({ name: 'bank_code', nullable: true, type: 'varchar' })
  bankCode: string | null;

  @Column({ name: 'bank_account', nullable: true, type: 'varchar' })
  bankAccount: string | null;

  @Column({ name: 'account_name', nullable: true, type: 'varchar' })
  accountName: string | null;

  @Column({ name: 'fx_rate', type: 'decimal', precision: 10, scale: 2, nullable: true })
  fxRate: number | null;

  @Column({ name: 'fail_reason', nullable: true, type: 'text' })
  failReason: string | null;

  @Column({ name: 'payment_no', nullable: true, type: 'varchar' })
  paymentNo: string | null;

  @Column({ name: 'bank_ref_id', nullable: true, type: 'varchar' })
  bankRefId: string | null;
}
```

#### `event-queue.entity.ts`:

```typescript
import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from './base.entity';

@Entity({ name: 'events_queue' })
@Index(['status'])
@Index(['txHash'], { unique: true })
export class EventQueue extends BaseEntity {
  @Column({ type: 'integer' })
  ledger: number;

  @Column({ name: 'tx_hash', type: 'varchar' })
  txHash: string;

  @Column({ name: 'contract_id', type: 'varchar' })
  contractId: string;

  @Column({ name: 'payload_json', type: 'jsonb' })
  payloadJson: Record<string, any>;

  @Column({ type: 'varchar', default: 'pending' })
  status: 'pending' | 'completed' | 'failed';
}
```

#### `di-symbols.ts`:

```typescript
// ── Repositories ────────────────────────────────────────────
export const TRANSACTION_REPOSITORY = 'TRANSACTION_REPOSITORY';
export const EVENT_QUEUE_REPOSITORY = 'EVENT_QUEUE_REPOSITORY';

// ── Services ────────────────────────────────────────────────
export const SEP31_TRANSACTION_SERVICE = 'SEP31_TRANSACTION_SERVICE';
export const NINEPAY_GATEWAY_SERVICE = 'NINEPAY_GATEWAY_SERVICE';
export const NINEPAY_MOCK_SERVICE = 'NINEPAY_MOCK_SERVICE';
export const STELLAR_SERVICE = 'STELLAR_SERVICE';
export const ORACLE_SERVICE = 'ORACLE_SERVICE';
export const BANK_VAULT_SERVICE = 'BANK_VAULT_SERVICE';
export const ANCHOR_RPC_SERVICE = 'ANCHOR_RPC_SERVICE';
export const WEBHOOK_SERVICE = 'WEBHOOK_SERVICE';

// ── Adapters ────────────────────────────────────────────────
export const NINEPAY_GATEWAY = 'NINEPAY_GATEWAY';
```

#### `webhook.service.ts`:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as crypto from 'crypto';

export interface WebhookPayload {
  anchorTxId: string;
  stellarMemo: string;
  status: string;
  updatedAt: string;
}

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);
  private readonly backendUrl: string;
  private readonly secret: string;

  constructor() {
    this.backendUrl =
      process.env.UCTALENT_BACKEND_WEBHOOK_URL ||
      'http://localhost:3000/api/v2/cross-border/settlement-callback';
    this.secret = process.env.WEBHOOK_SECRET || 'uctalent-dev-secret';
  }

  /**
   * Notify uctalent backend về trạng thái transaction.
   * Từ sep31-anchor.js: async function notifyUCTalentBackend(tx, status) (lines 148-175)
   */
  async notify(tx: { id: string; stellarMemo?: string; stellar_memo?: string }, status: string): Promise<void> {
    const payload: WebhookPayload = {
      anchorTxId: tx.id,
      stellarMemo: tx.stellarMemo || (tx as any).stellar_memo,
      status,
      updatedAt: new Date().toISOString(),
    };

    const payloadString = JSON.stringify(payload);
    const signature = 'sha256=' + crypto.createHmac('sha256', this.secret).update(payloadString).digest('hex');

    try {
      await axios.post(this.backendUrl, payload, {
        headers: {
          'Content-Type': 'application/json',
          'X-ANCHOR-SIGNATURE': signature,
        },
        timeout: 5000,
      });
      this.logger.log(`📮 Notified uctalent backend: ${status} for ${payload.stellarMemo}`);
    } catch (err: any) {
      this.logger.error(`❌ Failed to notify uctalent backend: ${err.message}`);
    }
  }
}
```

### Bước 2.4 — `apps/api` REST Controllers (dẫn code)

#### 2.4.1 SEP-31 Controller

**`apps/api/src/modules/sep31/sep31.controller.ts`**:

```typescript
import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Param, Patch, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import * as crypto from 'crypto';
import { Sep31TransactionService, CreateSep31TransactionDto } from '@uc/stellar';
import { AnchorRpcService } from '@uc/stellar';
import { BankVaultService } from '@uc/banking';
import { WebhookService } from '@uc/core';

/**
 * SEP-31 Anchor Controller.
 * Chuyển từ sep31-anchor.js (toàn bộ routes: ~1044 lines)
 *
 * Endpoints:
 *  - GET  /.well-known/stellar.toml       → SEP-1 discovery
 *  - GET  /sep31/info                     → Anchor capabilities
 *  - POST /sep31/transactions             → Initiate transfer
 *  - GET  /sep31/transactions/:id         → Poll status
 *  - PATCH /sep31/transactions/:id        → Update fields
 *  - POST /api/anchor/disburse            → Receive Soroban events
 *  - GET  /api/anchor/transactions        → List recent transactions
 */
@ApiTags('SEP-31')
@Controller()
export class Sep31Controller {
  // ... (implement tất cả routes)
}
```

**Chi tiết từng endpoint:**

**1. `GET /.well-known/stellar.toml`** — SEP-1 discovery (từ sep31-anchor.js lines 186-213):
```typescript
@Get('/.well-known/stellar.toml')
getStellarToml(): string {
  const networkPassphrase = process.env.NETWORK_PASSPHRASE || 'Test SDF Network ; September 2015';
  const anchorPublicKey = process.env.ANCHOR_PUBLIC_KEY || '';
  const usdcIssuer = process.env.USDC_ISSUER || 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
  const anchorDomain = process.env.ANCHOR_DOMAIN || `localhost:${process.env.ANCHOR_PORT || 4000}`;

  return `
VERSION = "2.0.0"
NETWORK_PASSPHRASE = "${networkPassphrase}"
ACCOUNTS            = []
SIGNING_KEY         = "${anchorPublicKey}"
TRANSFER_SERVER_SEP0031 = "https://${anchorDomain}"
KYC_SERVER          = "https://${anchorDomain}/sep12"
WEB_AUTH_ENDPOINT   = "https://${anchorDomain}/auth"

[[CURRENCIES]]
code        = "USDC"
issuer      = "${usdcIssuer}"
status      = "live"
is_asset_anchored = true
anchor_asset_type = "fiat"
anchor_asset      = "VND"
desc = "USD Coin — used as the cross-border settlement token for UCTalent"

[[PRINCIPALS]]
name  = "UCTalent Corp"
email = "ops@uctalent.io"
  `.trim();
}
```

**2. `GET /sep31/info`** — Anchor info (từ sep31-anchor.js lines 221-265):
```typescript
@Get('/sep31/info')
getSep31Info() {
  const usdcIssuer = process.env.USDC_ISSUER || 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
  return {
    receive: {
      USDC: {
        enabled: true,
        quotes_supported: false,
        min_amount: 1,
        max_amount: 100_000,
        fee_fixed: 0.5,
        fee_percent: 0,
        sender_sep12_type: 'uctalent-sender',
        receiver_sep12_type: 'uctalent-receiver',
        fields: {
          transaction: {
            routing_number: { description: 'UCTalent internal job contract ID', optional: false },
            account_number: { description: 'Receiver bank account number', optional: false },
            bank_code: { description: 'Receiver bank BIC/code (e.g. VCB, MB, TCB)', optional: false },
            account_name: { description: 'Receiver legal name', optional: false },
            memo: { description: 'Optional payment memo (max 255 chars)', optional: true },
          },
        },
      },
    },
  };
}
```

**3. `POST /sep31/transactions`** — Create transaction (từ sep31-anchor.js lines 284-380):
```typescript
@Post('/sep31/transactions')
@HttpCode(HttpStatus.CREATED)
async createTransaction(@Body() body: any) {
  // Validation (từ sep31-anchor.js lines 296-322)
  const { amount, asset_code, asset_issuer, receiver_id, sender_id, fields } = body;

  if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
    throw new BadRequestException('amount must be a positive number');
  }
  if (asset_code !== 'USDC') {
    throw new BadRequestException(`asset_code "${asset_code}" is not supported`);
  }
  if (!receiver_id) {
    throw new BadRequestException('receiver_id (SEP-12 KYC ID) is required');
  }

  const tf = fields?.transaction || {};
  const requiredFields = ['routing_number', 'account_number', 'bank_code', 'account_name'];
  for (const field of requiredFields) {
    if (!tf[field]) {
      throw new BadRequestException(`Missing required transaction field: ${field}`);
    }
  }

  // Gọi service tạo transaction
  const result = await this.sep31Service.createTransaction({
    amount: parseFloat(amount),
    assetCode: asset_code,
    assetIssuer: asset_issuer,
    receiverId: receiver_id,
    senderId: sender_id,
    fields: {
      routingNumber: tf.routing_number,
      accountNumber: tf.account_number,
      bankCode: tf.bank_code,
      accountName: tf.account_name,
      memo: tf.memo,
    },
  });

  return result;
}
```

**4. `POST /api/anchor/disburse`** — Receive Soroban events (từ sep31-anchor.js lines 458-648):
```typescript
@Post('/api/anchor/disburse')
@HttpCode(HttpStatus.OK)
async disburse(@Body() payload: any, @Headers('x-uctalent-signature') signature: string) {
  // 1. IP whitelist check (từ sep31-anchor.js lines 464-477)
  // 2. HMAC signature verification (từ sep31-anchor.js lines 479-489)
  // 3. Verify on-chain transaction (từ sep31-anchor.js lines 491-506)
  // 4. Idempotency check (từ sep31-anchor.js lines 516-531)
  // 5. Process splits → tạo clearing records (từ sep31-anchor.js lines 533-648)
  // 6. Trigger 9Pay clearing (setTimeout → use poller instead)
}
```

**5. `POST /api/9pay/callback`** — IPN receiver (từ sep31-anchor.js lines 858-959):
```typescript
@Post('/api/9pay/callback')
@HttpCode(HttpStatus.OK)
async handleIpnCallback(@Body() body: any) {
  // 1. Verify checksum (từ sep31-anchor.js lines 861-890)
  // 2. Load transaction by clearingId (từ sep31-anchor.js lines 895-900)
  // 3. Idempotency check (từ sep31-anchor.js lines 902-905)
  // 4. Update status (từ sep31-anchor.js lines 907-914)
  // 5. Propagate completion to parent SEP-31 tx (từ sep31-anchor.js lines 942-956)
  // 6. Notify uctalent backend (từ sep31-anchor.js lines 949-954)
}
```

### Bước 2.5 — `apps/worker` Background Services

#### 2.5.1 Soroban Listener

**`apps/worker/src/modules/soroban-listener/soroban-listener.service.ts`**:

Chuyển từ `listener.js` (full file, ~289 lines):

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AnchorRpcService, StellarService } from '@uc/stellar';
import { EventQueue } from '@uc/core';
import axios from 'axios';
import * as crypto from 'crypto';

/**
 * Soroban Event Listener (Queue-Based).
 * Từ listener.js — pollSorobanEvents + enqueueEvent.
 *
 * Flow:
 *   Producer (poller) ──→ SQLite queue ──→ Consumer (webhook)
 *                     ↑ events_queue table
 */
@Injectable()
export class SorobanListenerService {
  private readonly logger = new Logger(SorobanListenerService.name);
  private readonly watchedContracts: string[] = [];
  private lastProcessedLedger: number = 0;
  private readonly rpcUrl: string;
  private readonly contractId: string;
  private readonly webhookUrl: string;
  private readonly webhookSecret: string;

  constructor(
    private readonly anchorRpc: AnchorRpcService,
    private readonly stellar: StellarService,
    @InjectRepository(EventQueue)
    private readonly eventQueueRepo: Repository<EventQueue>,
  ) {
    this.rpcUrl = process.env.SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org';
    this.contractId = process.env.ESCROW_CONTRACT_ID || '';
    this.webhookUrl = process.env.SEP31_WEBHOOK_URL || 'http://localhost:4000/api/anchor/disburse';
    this.webhookSecret = process.env.WEBHOOK_SECRET || 'uctalent-dev-secret';

    if (!this.contractId) {
      this.logger.error('ESCROW_CONTRACT_ID not set — cannot listen for events');
      return;
    }

    this.watchedContracts.push(this.contractId);
  }

  /**
   * Khởi tạo ledger từ latest (từ listener.js lines 97-108).
   */
  @Interval('sorobanInit', 1000)
  async initialize() {
    if (this.lastProcessedLedger > 0) return;
    try {
      const ledger = await this.anchorRpc.getLatestLedger();
      this.lastProcessedLedger = ledger;
      this.logger.log(`Initialized at ledger ${ledger}. Watching for events...`);

      // Historical scan (từ listener.js lines 111-136)
      await this.scanHistoricalContracts();

      // Dừng interval init, chuyển sang poll
      // (Trong NestJS, @Interval chạy vĩnh viễn)
    } catch (err: any) {
      this.logger.error(`Failed to initialize: ${err.message}`);
    }
  }

  private async scanHistoricalContracts() {
    // Từ listener.js lines 111-136
  }

  /**
   * Poll Soroban events định kỳ (từ listener.js lines 138-174).
   */
  @Interval('sorobanPolling', parseInt(process.env.POLL_INTERVAL_MS || '5000'))
  async pollSorobanEvents() {
    // Từ listener.js lines 138-174
  }

  /**
   * Enqueue event vào database (từ listener.js lines 177-238).
   */
  private async enqueueEvent(event: any) {
    // Từ listener.js lines 177-238
  }

  /**
   * Scan child contract events (từ listener.js lines 241-254).
   */
  private async scanChildContractEvents(childAddr: string, startLedger: number) {
    // Từ listener.js lines 241-254
  }
}
```

#### 2.5.2 Event Consumer

**`apps/worker/src/modules/disbursement/event-consumer.service.ts`**:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventQueue } from '@uc/core';
import axios from 'axios';
import * as crypto from 'crypto';

/**
 * Queue Consumer — xử lý events từ queue và gọi webhook tới SEP-31 API.
 * Từ listener.js: processQueue (lines 258-285).
 */
@Injectable()
export class EventConsumerService {
  private readonly logger = new Logger(EventConsumerService.name);
  private readonly webhookUrl: string;
  private readonly webhookSecret: string;

  constructor(
    @InjectRepository(EventQueue)
    private readonly eventQueueRepo: Repository<EventQueue>,
  ) {
    this.webhookUrl = process.env.SEP31_WEBHOOK_URL || 'http://localhost:4000/api/anchor/disburse';
    this.webhookSecret = process.env.WEBHOOK_SECRET || 'uctalent-dev-secret';
  }

  @Interval('eventProcessing', parseInt(process.env.PROCESS_INTERVAL_MS || '2000'))
  async processNextEvent() {
    try {
      // Lấy event pending đầu tiên (từ listener.js line 260)
      const event = await this.eventQueueRepo.findOne({
        where: { status: 'pending' },
        order: { createdAt: 'ASC' },
      });
      if (!event) return;

      this.logger.log(`Processing queued event #${event.id} (Tx: ${event.txHash})`);

      // HMAC signature (từ listener.js lines 76-78)
      const signature = 'sha256=' + crypto
        .createHmac('sha256', this.webhookSecret)
        .update(event.txHash)
        .digest('hex');

      // Gọi webhook (từ listener.js lines 269-273)
      const res = await axios.post(this.webhookUrl, event.payloadJson, {
        headers: {
          'Content-Type': 'application/json',
          'X-UCTALENT-SIGNATURE': signature,
        },
        timeout: 10000,
      });

      this.logger.log(`Anchor responded ${res.status}`);
      await this.eventQueueRepo.update(event.id, { status: 'completed' });
    } catch (err: any) {
      const status = err.response?.status || 'N/A';
      this.logger.error(`Webhook dispatch failed (HTTP ${status}): ${err.message}`);
      // Mark failed (từ listener.js line 282)
      if (err.response?.status) {
        // Có thể thêm retry logic ở đây
      }
    }
  }
}
```

---

## Phase 3: Database migration — SQLite → PostgreSQL

### 3.1 TypeORM entities đã tạo ở Phase 2.3.1

### 3.2 Migration files

```bash
cd apps/api

# Cần typeorm CLI installed
pnpm add -D ts-node @types/node

# Tạo migration files
npx typeorm migration:create ./src/migrations/1712345678-CreateTransactionsTable
npx typeorm migration:create ./src/migrations/1712345679-CreateEventQueueTable
```

Migration class mẫu:
```typescript
import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateTransactionsTable1712345678 implements MigrationInterface {
  name = 'CreateTransactionsTable1712345678';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'transactions',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true },
          { name: 'created_at', type: 'timestamptz', default: 'NOW()' },
          { name: 'updated_at', type: 'timestamptz', default: 'NOW()' },
          { name: 'stellar_memo', type: 'varchar', isNullable: true },
          { name: 'stellar_tx_hash', type: 'varchar', isNullable: true },
          { name: 'kind', type: 'varchar', isNullable: true },
          { name: 'data', type: 'jsonb', isNullable: true },
          { name: 'party', type: 'varchar', isNullable: true },
          { name: 'clearing_id', type: 'varchar', isNullable: true },
          { name: 'status', type: 'varchar', isNullable: true },
          { name: 'amount_vnd', type: 'decimal', precision: 15, scale: 0, isNullable: true },
          { name: 'bank_code', type: 'varchar', isNullable: true },
          { name: 'bank_account', type: 'varchar', isNullable: true },
          { name: 'account_name', type: 'varchar', isNullable: true },
          { name: 'fx_rate', type: 'decimal', precision: 10, scale: 2, isNullable: true },
          { name: 'fail_reason', type: 'text', isNullable: true },
          { name: 'payment_no', type: 'varchar', isNullable: true },
          { name: 'bank_ref_id', type: 'varchar', isNullable: true },
        ],
      }),
      true,
    );

    await queryRunner.createIndex('transactions', new TableIndex({ name: 'idx_stellar_memo', columnNames: ['stellar_memo'] }));
    await queryRunner.createIndex('transactions', new TableIndex({ name: 'idx_stellar_tx_hash', columnNames: ['stellar_tx_hash'] }));
    await queryRunner.createIndex('transactions', new TableIndex({ name: 'idx_clearing_id', columnNames: ['clearing_id'] }));
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('transactions');
  }
}
```

### 3.3 Seed data (KYC mock)

**`apps/api/src/seeds/kyc-mock.seed.ts`**:
```typescript
import { DataSource } from 'typeorm';
import * as crypto from 'crypto';

export async function seedKycMockData(dataSource: DataSource): Promise<void> {
  const salt = process.env.KYC_SALT || 'uctalent-salt-2026';
  const devKycHash = crypto.createHash('sha256').update('kyc_dev_001' + salt).digest('hex');
  const scoutKycHash = crypto.createHash('sha256').update('kyc_scout_001' + salt).digest('hex');

  // Insert vào bảng mock KYC (nếu có entity riêng)
  // Hoặc dùng BankVaultService.in-memory map
}
```

### 3.4 Data migration script (SQLite → PostgreSQL)

**`scripts/migrate-sqlite-to-postgres.ts`**:

```typescript
import Database from 'better-sqlite3';
import { createConnection } from 'typeorm';
import { Transaction } from '@uc/core';

async function migrate() {
  // 1. Đọc từ SQLite
  const sqliteDb = new Database('disbursement-bridge/anchor.db');
  const rows = sqliteDb.prepare('SELECT * FROM transactions').all();

  // 2. Kết nối PostgreSQL
  const pgConnection = await createConnection({
    type: 'postgres',
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '15432'),
    username: process.env.POSTGRES_USER || 'uct_rails_dev_root',
    password: process.env.POSTGRES_PASSWORD || '',
    database: process.env.POSTGRES_DB || 'uct_cross_border_dev',
    entities: [Transaction],
    synchronize: false,
  });

  const repo = pgConnection.getRepository(Transaction);

  // 3. Migrate từng row
  for (const row of rows) {
    const data = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
    const tx = new Transaction();
    tx.id = row.id;
    tx.stellarMemo = row.stellar_memo || data.stellarMemo || data.stellar_memo || null;
    tx.stellarTxHash = row.stellar_tx_hash || data.stellarTxHash || null;
    tx.kind = row.kind || data.kind || null;
    tx.data = data;
    tx.status = data.status || null;
    tx.createdAt = new Date();
    tx.updatedAt = new Date();
    await repo.save(tx);
  }

  // 4. Đóng connections
  sqliteDb.close();
  await pgConnection.close();

  console.log(`✅ Migrated ${rows.length} transactions from SQLite to PostgreSQL`);
}

migrate().catch(console.error);
```

---

## Phase 4: Frontend migration — React/JSX → Next.js/TypeScript

### 4.1 Init Next.js app

```bash
cd frontend
pnpm create next-app@latest . --typescript --app --src-dir --import-alias "@/*"

# Dependencies
pnpm add @stellar/stellar-sdk @stellar/freighter-api lucide-react
```

### 4.2 Chi tiết component splitting

Bảng mapping từ `App.jsx` (1200+ lines) → Next.js components:

| App.jsx lines | Fragment | Target file | Mô tả |
|---|---|---|---|
| 1-37 | Imports + SCVal helpers | `src/lib/stellar/scval.ts` | `hexToUint8Array`, `makeReferralConfigScVal`, `makeMilestoneConfigScVal` |
| 31-37 | `hexToUint8Array` | `src/lib/stellar/helpers.ts` | Utility function |
| 39-67 | `makeReferralConfigScVal` | `src/lib/stellar/scval.ts` | Build referral config SCVal map |
| 69-98 | `makeMilestoneConfigScVal` | `src/lib/stellar/scval.ts` | Build milestone config SCVal map |
| 100-130 | App state: flowType, usdcAmount | `src/hooks/useSimulator.ts` | Core simulator state |
| 120-131 | talentKeypair | `src/hooks/useWallet.ts` | Ephemeral keypair management |
| 147-187 | Wallet connection | `src/hooks/useWallet.ts` | `connectWallet`, `connectWalletNavbar` |
| 153-187 | `connectWalletNavbar` | `src/lib/stellar/wallet.ts` | Freighter connection logic |
| 189-208 | Wallet polling | `src/hooks/useWallet.ts` | `useEffect` wallet auto-check |
| 210-254 | `handleOpenTrustline` | `src/lib/stellar/trustline.ts` | Trustline establishment |
| 256-281 | `ensureTalentFunded` | `src/lib/stellar/funding.ts` | Friendbot funding |
| 283-306 | Wallet init + milestone parsing | `src/hooks/useSimulator.ts` | Initialization effects |
| 309-314 | auditTrail state | `src/hooks/useAuditTrail.ts` | 4-ID audit trail |
| 317-345 | logs state + addLog | `src/hooks/useTerminal.ts` | Terminal log management |
| 347-377 | handleAmountChange + fxRate | `src/hooks/useSimulator.ts` | FX rate polling |
| 379-393 | Distribution calculations | `src/hooks/useSimulator.ts` | Amount calculations |
| 395-697 | `handleSetupEscrow` | `src/hooks/useEscrow.ts` | Factory + deposit flow |
| 700-845 | `handleSign` + `signEscrowOnChain` | `src/hooks/useSignature.ts` | Dual-signature on-chain |
| 847-961 | `monitorDisbursement` | `src/hooks/useDisbursement.ts` | Poll + monitor disbursement |
| 963-993 | `triggerSmsNotifications` | `src/hooks/useNotifications.ts` | SMS simulation |
| 996-1016 | `handleReset` | `src/hooks/useSimulator.ts` | Reset state |
| 1018-1088 | Header + navigation + wallet | `src/components/layout/Header.tsx` | Navigation + wallet badge |
| 1091-1193 | Dashboard grid + stepper | `src/components/layout/DashboardLayout.tsx` | Main layout |
| 1198-... | Simulator controls | `src/components/simulator/SetupCard.tsx` | Setup form |
| | | `src/components/simulator/SignatureCard.tsx` | Signature UI |
| | | `src/components/simulator/DisbursementCard.tsx` | Disbursement status |
| | | `src/components/simulator/AuditTrail.tsx` | 4-ID display |
| | | `src/components/simulator/Notifications.tsx` | SMS notifications |
| | | `src/components/terminal/LiveTerminal.tsx` | Console logs |
| Pages | | `src/app/page.tsx` | Dashboard |
| | | `src/app/simulator/page.tsx` | Simulator full page |
| | | `src/app/client-portal/page.tsx` | Client portal |
| | | `src/app/talent-hub/page.tsx` | Talent hub |
| | | `src/app/live-terminal/page.tsx` | Terminal only |

### 4.3 Key hook implementation: `useWallet.ts`

```typescript
'use client';
import { useState, useEffect } from 'react';
import { isConnected, requestAccess, getPublicKey } from '@stellar/freighter-api';
import * as StellarSdk from '@stellar/stellar-sdk';

export function useWallet() {
  const [walletAddress, setWalletAddress] = useState('Connect Wallet');
  const [walletConnected, setWalletConnected] = useState(false);
  const [walletBalances, setWalletBalances] = useState({ xlm: '0.00', usdc: '0.00' });
  const [hasUsdcTrustline, setHasUsdcTrustline] = useState(false);

  const connectWallet = async () => {
    try {
      const connected = await isConnected();
      if (!connected) {
        console.warn('Freighter is not installed!');
        return;
      }
      const accessRes = await requestAccess();
      if (accessRes.error) throw new Error(accessRes.error);

      const pubKey = accessRes.address;
      setWalletAddress(pubKey.substring(0, 6) + '...' + pubKey.substring(pubKey.length - 4));
      setWalletConnected(true);

      const horizonServer = new StellarSdk.Horizon.Server('https://horizon-testnet.stellar.org');
      const account = await horizonServer.loadAccount(pubKey);

      let xlm = '0.00', usdc = '0.00', hasTrust = false;
      account.balances.forEach((b: any) => {
        if (b.asset_type === 'native') xlm = parseFloat(b.balance).toFixed(2);
        if (b.asset_code === 'USDC' && b.asset_issuer === 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5') {
          usdc = parseFloat(b.balance).toFixed(2);
          hasTrust = true;
        }
      });

      setWalletBalances({ xlm, usdc });
      setHasUsdcTrustline(hasTrust);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    connectWallet();
    const interval = setInterval(async () => {
      try {
        if (await isConnected()) {
          const currentPubKey = await getPublicKey();
          if (currentPubKey) {
            connectWallet();
          }
        }
      } catch { }
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  return { walletAddress, walletConnected, walletBalances, hasUsdcTrustline, connectWallet };
}
```

### 4.4 Key hook: `useEscrow.ts` (factory + deposit)

```typescript
'use client';
import { useState } from 'react';
import * as StellarSdk from '@stellar/stellar-sdk';
import { isConnected, requestAccess, signTransaction } from '@stellar/freighter-api';

export function useEscrow() {
  const [childContractId, setChildContractId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const setupEscrow = async (
    usdcAmount: number,
    flowType: 'referral' | 'milestone',
    milestones: number[],
    talentKeypair: StellarSdk.Keypair,
    onLog: (type: string, msg: string) => void,
  ) => {
    setIsProcessing(true);

    try {
      const connected = await isConnected();
      if (!connected) throw new Error('Freighter not connected');
      const accessRes = await requestAccess();
      if (accessRes.error) throw new Error(`Wallet access denied: ${accessRes.error}`);

      const publicKey = accessRes.address;
      const horizonServer = new StellarSdk.Horizon.Server('https://horizon-testnet.stellar.org');
      const sorobanServer = new StellarSdk.rpc.Server('https://soroban-testnet.stellar.org');
      const account = await horizonServer.loadAccount(publicKey);

      // Stage 1: Create escrow from Factory (từ App.jsx lines 470-562)
      const factoryId = (typeof window !== 'undefined' && (window as any).VITE_CONTRACT_ID) ||
        'CCKDGWWTDPU62JZSMHZR4ZEG6DGUFBHSU3ON466LVQO3I7N3PTZ363QI';
      const factoryContract = new StellarSdk.Contract(factoryId);

      const methodCall = flowType === 'referral' ? 'create_referral_escrow' : 'create_milestone_escrow';

      // Build transaction, simulate, sign, submit
      // (chi tiết từ App.jsx lines 517-562)

      // Stage 2: Deposit (từ App.jsx lines 564-697)
      // ...

      setIsProcessing(false);
    } catch (err: any) {
      onLog('error', `Setup failed: ${err.message}`);
      setIsProcessing(false);
    }
  };

  return { childContractId, setChildContractId, isProcessing, setupEscrow };
}
```

### 4.5 Pages structure

**`src/app/layout.tsx`**:
```typescript
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="dark-theme">{children}</body>
    </html>
  );
}
```

**`src/app/page.tsx`** (Dashboard with tabs):
```typescript
'use client';
import { useState } from 'react';
import { Header } from '@/components/layout/Header';
import { SimulatorPage } from '@/app/simulator/page';
import { ClientPortalPage } from '@/app/client-portal/page';
import { TalentHubPage } from '@/app/talent-hub/page';
import { LiveTerminalPage } from '@/app/live-terminal/page';

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState('simulator');

  return (
    <div className="app-container">
      <Header activeTab={activeTab} onTabChange={setActiveTab} />
      <main className="dashboard-grid">
        {activeTab === 'simulator' && <SimulatorPage />}
        {activeTab === 'client-portal' && <ClientPortalPage />}
        {activeTab === 'talent-hub' && <TalentHubPage />}
        {activeTab === 'live-terminal' && <LiveTerminalPage />}
      </main>
    </div>
  );
}
```

### 4.6 Stellar constants

**`src/lib/stellar/constants.ts`**:
```typescript
export const STELLAR_NETWORK = {
  HORIZON: 'https://horizon-testnet.stellar.org',
  SOROBAN_RPC: 'https://soroban-testnet.stellar.org',
  NETWORK_PASSPHRASE: 'Test SDF Network ; September 2015',
};

export const USDC_ASSET = {
  code: 'USDC',
  issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
};

export const DEFAULT_CONTRACT_IDS = {
  FACTORY: 'CCKDGWWTDPU62JZSMHZR4ZEG6DGUFBHSU3ON466LVQO3I7N3PTZ363QI',
};

export const API_BASE_URL = 'http://localhost:4000';
```

---

## Phase 5: Integration & alignment với uctalent backend

### 5.1 Route alignment

Hiện tại `Sep31Adapter` trong uctalent backend gọi:
```
BUSINESS_SERVER_URL = http://localhost:8081
POST /sep31/initiate  →  http://localhost:8081/sep31/initiate
```

Cần thay đổi:
- NestJS API chạy port 4000 (giữ nguyên từ `.env`)
- Routes dưới global prefix `/api`:
  - `/api/.well-known/stellar.toml`
  - `/api/sep31/info`
  - `/api/sep31/transactions`
  - `/api/anchor/disburse`
  - `/api/9pay/callback`
  - `/health`
- Cập nhật `BUSINESS_SERVER_URL` trong uctalent's `.env` nếu cần

### 5.2 HMAC auth guard

**`apps/api/src/modules/sep31/guards/anchor-webhook.guard.ts`**:
```typescript
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import * as crypto from 'crypto';

@Injectable()
export class AnchorWebhookGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const signature = request.headers['x-uctalent-signature'] || '';
    const payload = request.body;
    const webhookSecret = process.env.WEBHOOK_SECRET || 'uctalent-dev-secret';

    const ipWhitelist = (process.env.ALLOWED_WEBHOOK_IPS || '127.0.0.1,::1')
      .split(',')
      .map((ip: string) => ip.trim().toLowerCase());

    const clientIp = (request.headers['x-forwarded-for'] || request.socket.remoteAddress || '')
      .split(',')
      .map((ip: string) => ip.trim().toLowerCase())[0];

    const isIpWhitelisted = ipWhitelist.some((allowedIp: string) =>
      clientIp === allowedIp || clientIp.includes(allowedIp),
    );

    const expectedSig = 'sha256=' + crypto
      .createHmac('sha256', webhookSecret)
      .update(payload.stellarTxHash || '')
      .digest('hex');

    if (!isIpWhitelisted) {
      throw new UnauthorizedException('IP not whitelisted');
    }

    if (signature !== expectedSig && signature !== 'bypass') {
      throw new UnauthorizedException('HMAC signature mismatch');
    }

    return true;
  }
}
```

### 5.3 Docker setup

**`Dockerfile`** (multi-stage, match uctalent's `node:20-alpine`):
```dockerfile
# ── Build stage ──────────────────────────────────────────────
FROM node:20-alpine AS builder
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app

# Copy dependency manifests
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY apps/worker/package.json apps/worker/
COPY packages/core/package.json packages/core/
COPY packages/banking/package.json packages/banking/
COPY packages/stellar/package.json packages/stellar/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build
RUN pnpm --filter @uc/core build && \
    pnpm --filter @uc/stellar build && \
    pnpm --filter @uc/banking build && \
    pnpm --filter @uc/api build

# ── Runtime stage ────────────────────────────────────────────
FROM node:20-alpine
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app

COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/node_modules ./node_modules
COPY --from=builder /app/packages/core/dist ./node_modules/@uc/core
COPY --from=builder /app/packages/stellar/dist ./node_modules/@uc/stellar
COPY --from=builder /app/packages/banking/dist ./node_modules/@uc/banking

EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget --no-verbose --tries=1 --spider http://localhost:4000/health || exit 1

CMD ["node", "dist/main.js"]
```

**`docker-compose.yml`**:
```yaml
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    container_name: uc-cross-border-db
    restart: unless-stopped
    environment:
      POSTGRES_USER: uct_rails_dev_root
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-DcglAQ2zrRNMiihqm1AMmVwBuY8q3ebB}
      POSTGRES_DB: uct_cross_border_dev
    ports:
      - "15432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    networks:
      - internal-backend

  api:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: uc-cross-border-api
    restart: unless-stopped
    ports:
      - "4000:4000"
    depends_on:
      postgres:
        condition: service_started
    env_file:
      - .env
    environment:
      POSTGRES_HOST: postgres
    networks:
      - internal-backend

  worker:
    build:
      context: .
      dockerfile: Dockerfile.worker
    container_name: uc-cross-border-worker
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_started
    env_file:
      - .env
    environment:
      POSTGRES_HOST: postgres
    networks:
      - internal-backend

networks:
  internal-backend:
    driver: bridge

volumes:
  pgdata:
```

**`Dockerfile.worker`**:
```dockerfile
FROM node:20-alpine AS builder
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/worker/package.json apps/worker/
COPY packages/core/package.json packages/core/
COPY packages/stellar/package.json packages/stellar/
COPY packages/banking/package.json packages/banking/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter @uc/core build && \
    pnpm --filter @uc/stellar build && \
    pnpm --filter @uc/banking build && \
    pnpm --filter @uc/worker build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/apps/worker/dist ./dist
COPY --from=builder /app/apps/worker/node_modules ./node_modules
CMD ["node", "dist/main.js"]
```

### 5.4 CI/CD

**`cloudbuild.dev.yaml`** (Google Cloud Build):
```yaml
steps:
  - name: 'node:20-alpine'
    entrypoint: 'pnpm'
    args: ['install', '--frozen-lockfile']

  - name: 'node:20-alpine'
    entrypoint: 'pnpm'
    args: ['build']

  - name: 'node:20-alpine'
    entrypoint: 'pnpm'
    args: ['test']

  - name: 'gcr.io/cloud-builders/docker'
    args:
      - 'build'
      - '-t'
      - 'gcr.io/$PROJECT_ID/uc-cross-border-api:$COMMIT_SHA'
      - '-f'
      - 'Dockerfile'
      - '.'

  - name: 'gcr.io/cloud-builders/docker'
    args:
      - 'build'
      - '-t'
      - 'gcr.io/$PROJECT_ID/uc-cross-border-worker:$COMMIT_SHA'
      - '-f'
      - 'Dockerfile.worker'
      - '.'

images:
  - 'gcr.io/$PROJECT_ID/uc-cross-border-api:$COMMIT_SHA'
  - 'gcr.io/$PROJECT_ID/uc-cross-border-worker:$COMMIT_SHA'
```

---

## Phase 6: Testing & cleanup

### 6.1 Jest config

**`apps/api/jest.config.ts`**:
```typescript
import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  collectCoverageFrom: ['src/**/*.(t|j)s'],
  coverageDirectory: './coverage',
  testEnvironment: 'node',
  moduleNameMapper: {
    '@uc/core': '<rootDir>/../../packages/core/src',
    '@uc/banking': '<rootDir>/../../packages/banking/src',
    '@uc/stellar': '<rootDir>/../../packages/stellar/src',
  },
};

export default config;
```

### 6.2 Unit test examples

**`apps/api/src/modules/sep31/__tests__/sep31.controller.spec.ts`**:
```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { Sep31Controller } from '../sep31.controller';

describe('Sep31Controller', () => {
  let controller: Sep31Controller;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [Sep31Controller],
      providers: [
        // Mock services
      ],
    }).compile();

    controller = module.get<Sep31Controller>(Sep31Controller);
  });

  describe('GET /sep31/info', () => {
    it('should return anchor capabilities', () => {
      const result = controller.getSep31Info();
      expect(result.receive.USDC.enabled).toBe(true);
      expect(result.receive.USDC.fee_fixed).toBe(0.5);
    });
  });
});
```

### 6.3 E2E tests (port từ `e2e.test.js`)

**`apps/api/test/sep31.e2e-spec.ts`**:
```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('SEP-31 Anchor (E2E)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /.well-known/stellar.toml returns TOML', async () => {
    const res = await request(app.getHttpServer())
      .get('/.well-known/stellar.toml')
      .expect(200);
    expect(res.text).toContain('UCTalent Anchor');
    expect(res.text).toContain('TRANSFER_SERVER_SEP0031');
  });

  it('GET /sep31/info returns anchor capabilities', async () => {
    const res = await request(app.getHttpServer())
      .get('/sep31/info')
      .expect(200);
    expect(res.body.receive.USDC.enabled).toBe(true);
  });

  it('POST /sep31/transactions creates a transaction', async () => {
    const res = await request(app.getHttpServer())
      .post('/sep31/transactions')
      .send({
        amount: '100',
        asset_code: 'USDC',
        receiver_id: 'kyc_dev_001',
        fields: {
          transaction: {
            routing_number: 'contract-123',
            account_number: '123456789',
            bank_code: 'BIDV',
            account_name: 'TEST USER',
          },
        },
      })
      .expect(201);
    expect(res.body.id).toBeDefined();
  });

  it('POST /api/anchor/disburse with invalid signature returns 401', async () => {
    await request(app.getHttpServer())
      .post('/api/anchor/disburse')
      .set('x-uctalent-signature', 'invalid')
      .send({ stellarTxHash: '0xmock' })
      .expect(401);
  });

  it('POST /api/anchor/disburse with bypass signature succeeds', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/anchor/disburse')
      .set('x-uctalent-signature', 'bypass')
      .send({
        stellarTxHash: '0xmock_tx_hash_12345',
        stellarMemo: 'TEST_MEMO_001',
        oracleRate: 25450,
        splits: {
          talent: { amountUsdc: 80, kycId: 'abc123' },
          scout: { amountUsdc: 0, kycId: null },
          platform: { amountUsdc: 20, kycId: null },
        },
      })
      .expect(200);
    expect(res.body.status).toBe('processing');
    expect(res.body.disbursements).toBeDefined();
    expect(res.body.disbursements.length).toBeGreaterThan(0);
  });
});
```

### 6.4 Lint + TypeCheck

```bash
# Kiểm tra toàn bộ workspace
pnpm lint          # ESLint
pnpm typecheck     # tsc --noEmit
pnpm test          # Jest

# Kiểm tra từng app
pnpm --filter @uc/api lint
pnpm --filter @uc/api typecheck
pnpm --filter @uc/api test
```

### 6.5 Cleanup

```bash
# Sau khi migration hoàn tất và verified:
rm -rf disbursement-bridge/
rm -rf uctalent-disbursement-demo/
rm -f start.sh test_predeployed.sh
rm -f *.postman_collection.json

# Update .gitignore
cat >> .gitignore << 'EOF'
# Old project files
disbursement-bridge/
uctalent-disbursement-demo/

# Databases
*.db
*.sqlite

# Build output
dist/

# Environment (keep template)
.env
!.env.example
EOF
```

### 6.6 Update start.sh

**`start.sh`** (mới):
```bash
#!/bin/bash
set -e

echo "═══════════════════════════════════════════════"
echo "  UC Cross-Border — Starting all services..."
echo "═══════════════════════════════════════════════"

# Kiểm tra environment
if [ ! -f .env ]; then
  echo "❌ .env file not found! Copy from .env.example"
  exit 1
fi

# Start services
echo "📡 Starting Soroban Event Listener (Worker)..."
pnpm dev:worker &
WORKER_PID=$!

echo "🌐 Starting SEP-31 Anchor API..."
pnpm dev:api &
API_PID=$!

echo "🎨 Starting Frontend (Next.js)..."
pnpm dev:frontend &
FRONTEND_PID=$!

# Handle shutdown
trap "echo 'Shutting down...'; kill $WORKER_PID $API_PID $FRONTEND_PID; exit 0" SIGINT SIGTERM

echo "═══════════════════════════════════════════════"
echo "  API:      http://localhost:4000"
echo "  API Docs: http://localhost:4000/api/docs"
echo "  Frontend: http://localhost:5173"
echo "═══════════════════════════════════════════════"

wait
```

---

## Checklist tổng thể thực thi

### Phase 1: Setup infra
- [x] Git: branch mới `migration/nestjs` (stellar branch verified)
- [x] 1.1 Tạo `pnpm-workspace.yaml` + root `package.json`
- [x] 1.2 Tạo `tsconfig.base.json`
- [x] 1.3 Init `apps/api` (NestJS + SWC)
- [x] 1.4 Init `apps/worker` (standalone)
- [x] 1.5 Init `packages/core`, `packages/banking`, `packages/stellar`
- [x] 1.6 Setup ESLint + Prettier
- [x] 1.7 Tạo env config
- [x] 1.8 `pnpm install` + verify NestJS apps running

### Phase 2: Backend logic
- [x] 2.1a `StellarService` (helpers: toNative, stroopsToUsdc)
- [x] 2.1b `Sep31TransactionService` (CRUD, build response)
- [x] 2.1c `AnchorRpcService` (getEvents, getTransaction)
- [x] 2.2a `NinePayGatewayService` (API client + signature)
- [x] 2.2b `NinePayMockService` (simulate clearing)
- [x] 2.2c `OracleService` (exchange rate)
- [x] 2.2d `BankVaultService` (KYC resolution)
- [x] 2.3a DB entities & raw querying client (Core DB service)
- [x] 2.3b DI symbols
- [x] 2.3c Webhook notifications (Event Consumer webhook client)
- [x] 2.4a SEP-31 controller (tất cả routes)
- [x] 2.4b Disburse controller (anchor/disburse)
- [x] 2.4c IPN controller (9pay/callback)
- [x] 2.4d Rate + KYC + Health controllers
- [x] 2.5a `SorobanListenerService` (poll + enqueue)
- [x] 2.5b `EventConsumerService` (process queue)
- [x] 2.5c `DisbursementPollerService` (retry + monitor)
- [x] 2.6 Module wiring + database integration
- [x] **Verify:** Full API + Worker chạy local

### Phase 3: Database
- [x] 3.1 Database schema deployed
- [x] 3.2 Migration files created + run (migrate-sqlite.ts verified)
- [x] 3.3 Seed data (KYC mock)
- [x] 3.4 PostgreSQL docker-compose verified
- [x] **Verify:** Queries work, data persists

### Phase 4: Frontend
- [x] 4.1 Init Next.js + dependencies (Using main uc-frontend-nextjs-v1 workspace instead of a standalone demo)
- [x] 4.2 Stellar helpers → `src/lib/stellar/` (Integrated into main frontend workspace)
- [x] 4.3 Custom hooks (useWallet, useEscrow, useSignature, useDisbursement) (Integrated into main frontend hooks)
- [x] 4.4 Layout components (Header, Stepper, Dashboard) (Integrated into main frontend pages)
- [x] 4.5 Simulator components (SetupCard, SignatureCard, DisbursementCard) (Bypassed in favor of the production-ready Payout Center interface)
- [x] 4.6 Pages (Simulator, Client Portal, Talent Hub, Terminal) (Aligned with production client dashboard & earnings withdrawal flow)
- [x] **Verify:** Frontend workspace builds and runs successfully

### Phase 5: Integration
- [x] 5.1 Route alignment (global prefix and relative controllers verified)
- [x] 5.2 HMAC auth guard
- [x] 5.3 Swagger docs verified
- [x] 5.4 Dockerfile + docker-compose
- [x] 5.5 CI/CD config
- [x] **Verify:** Docker compose and container build check

### Phase 6: Testing + Cleanup
- [x] 6.1 Jest config + unit tests
- [x] 6.2 E2E tests (port from legacy E2E spec)
- [x] 6.3 `npm run lint` + `npm run typecheck` pass
- [x] 6.4 Cleanup legacy files (business-server and legacy disbursement-bridge folders decommissioned)
- [x] 6.5 Update `start.sh`
- [x] **Final:** Git commit and stage changes

---

## Dòng thời gian ước tính

| Phase | Ngày | Kết quả cụ thể |
|---|---|---|
| Phase 1 — Setup infra | 1-2 | `pnpm dev:api` chạy ở port 4000, Swagger docs OK |
| Phase 2 — Backend logic | 4-5 | Tất cả endpoints hoạt động, worker poll + process event |
| Phase 3 — Database | 1-2 | PostgreSQL connected, TypeORM queries OK |
| Phase 4 — Frontend | 3-4 | Next.js app với simulator flow hoàn chỉnh |
| Phase 5 — Integration | 1-2 | Docker, CI/CD, kết nối uctalent backend thành công |
| Phase 6 — Testing | 1-2 | Tests pass, cleanup hoàn tất |

**Tổng: ~11-17 ngày** (phụ thuộc vào familiarity với NestJS + Stellar SDK)

---

## Rủi ro & biện pháp

| Rủi ro | Mức | Giảm thiểu |
|---|---|---|
| Stellar SDK version conflict (v13 vs v15) | **Cao** | Dùng `^13.0.0` cho backend, `^15.x` cho frontend (vì frontend cần Freighter) |
| PostgreSQL chưa có local | Thấp | docker-compose đã config sẵn Postgres |
| 9Pay sandbox credentials hết hạn | Trung bình | Giữ mock fallback (sẵn có trong code cũ), dev không cần real credentials |
| API contract thay đổi ảnh hưởng uctalent backend | **Cao** | Không đổi API contract giữa Sep31Adapter ↔ uc-cross-border, chỉ đổi internal |
| Queue retry + DLQ phức tạp | Trung bình | Phase 1 giữ simple retry (exponential backoff), sau này upgrade lên BullMQ |
| setTimeout chain không migration được nguyên xi | Trung bình | Dùng `@nestjs/schedule` + `@Interval()` + poller service |
| Môi trường dev không có Soroban testnet | Thấp | Dùng mock event trigger (POST /api/anchor/disburse với bypass signature) |

> **Khuyến nghị thực thi:** Làm tuần tự Phase 1 → Phase 2 (ưu tiên packages → API controllers → Worker). Phase 4 (Frontend) có thể làm song song sau khi Phase 2 packages hoàn tất. Phase 3 (Database) làm sớm để tránh rework TypeORM entities sau này.
