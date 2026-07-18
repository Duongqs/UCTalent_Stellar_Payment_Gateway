/**
 * Manual SQL migration runner for scripts/migrations/*.sql
 *
 * Usage (from monorepo root, with .env loaded):
 *   npm run build -w @uc/core && npm run db:migrate
 *
 * Or against a running container's DB via local .env / POSTGRES_* vars.
 */
import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';
import { SqlMigrationService } from '../services/sql-migration.service';

dotenv.config();

async function main() {
  const host = process.env.POSTGRES_HOST || 'localhost';
  const port = parseInt(process.env.POSTGRES_PORT || '5432', 10);
  const username = process.env.POSTGRES_USER || 'postgres';
  const password = process.env.POSTGRES_PASSWORD || 'password';
  const database = process.env.POSTGRES_DB || 'uct_cross_border_dev';

  console.log(
    `[db:migrate] Connecting ${username}@${host}:${port}/${database}`,
  );

  const dataSource = new DataSource({
    type: 'postgres',
    host,
    port,
    username,
    password,
    database,
  });

  await dataSource.initialize();
  try {
    const migrationService = new SqlMigrationService(dataSource);
    await migrationService.runPendingMigrations();
    console.log('[db:migrate] Done');
  } finally {
    await dataSource.destroy();
  }
}

main().catch((err) => {
  console.error('[db:migrate] Failed:', err);
  process.exit(1);
});
