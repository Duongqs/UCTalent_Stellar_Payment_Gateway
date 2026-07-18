import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class SqlMigrationService {
  private readonly logger = new Logger(SqlMigrationService.name);

  constructor(private readonly dataSource: DataSource) {}

  private resolveMigrationsDir(): string {
    const fromEnv = process.env.MIGRATIONS_PATH?.trim();
    if (fromEnv) {
      return path.resolve(fromEnv);
    }
    // Docker WORKDIR=/app; local monorepo root when started via npm run start:api
    return path.resolve(process.cwd(), 'scripts/migrations');
  }

  async runPendingMigrations(): Promise<void> {
    const migrationsDir = this.resolveMigrationsDir();

    if (!fs.existsSync(migrationsDir)) {
      this.logger.warn(
        `Migrations directory not found: ${migrationsDir} — skipping`,
      );
      return;
    }

    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS uc_stellar_schema_migrations (
        id text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    // Serialize across API replicas / restarts
    await this.dataSource.query(`SELECT pg_advisory_lock(872314001)`);

    try {
      const appliedRows: Array<{ id: string }> = await this.dataSource.query(
        `SELECT id FROM uc_stellar_schema_migrations ORDER BY id ASC`,
      );
      const applied = new Set(appliedRows.map((r) => r.id));

      const files = fs
        .readdirSync(migrationsDir)
        .filter((f) => f.endsWith('.sql'))
        .sort();

      const pending = files.filter((f) => !applied.has(f));

      if (pending.length === 0) {
        this.logger.log('No pending SQL migrations');
        return;
      }

      this.logger.log(`Running ${pending.length} SQL migration(s)...`);

      for (const file of pending) {
        const fullPath = path.join(migrationsDir, file);
        const sql = fs.readFileSync(fullPath, 'utf8');
        this.logger.log(`  → ${file}`);
        await this.dataSource.query(sql);
        await this.dataSource.query(
          `INSERT INTO uc_stellar_schema_migrations (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`,
          [file],
        );
      }

      this.logger.log(`Successfully applied ${pending.length} migration(s)`);
    } finally {
      await this.dataSource.query(`SELECT pg_advisory_unlock(872314001)`);
    }
  }
}
