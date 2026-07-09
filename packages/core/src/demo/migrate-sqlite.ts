import { Pool } from 'pg';
import * as path from 'path';
import * as fs from 'fs';
import * as dotenv from 'dotenv';

dotenv.config();

const host = process.env.POSTGRES_HOST || 'localhost';
const port = parseInt(process.env.POSTGRES_PORT || '15432', 10);
const user = process.env.POSTGRES_USER || 'uct_rails_dev_root';
const password = process.env.POSTGRES_PASSWORD || '';
const database = process.env.POSTGRES_DB || 'uct_cross_border_dev';

export const pool = new Pool({
  host,
  port,
  user,
  password,
  database,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

async function query(text: string, params?: any[]) {
  const result = await pool.query(text, params);
  return result.rows[0] ?? null;
}

export async function migrateSqlite() {
  console.log('Starting migration from legacy SQLite to PostgreSQL...');

  // This was originally a one-time migration from a legacy Soroban event queue
  // stored in SQLite (disbursement-bridge/bridge_queue.db).
  // Since all data has been migrated, this script is now a no-op.
  // The bridge_queue.db file no longer exists in production.
  console.log('Legacy SQLite migration is complete. No action needed.');
  console.log('The Soroban event listener now writes directly to PostgreSQL (bridge_events_queue table).');
}

// If run directly
if (require.main === module) {
  migrateSqlite()
    .then(() => pool.end())
    .catch((err) => {
      console.error('Migration script failed:', err);
      pool.end();
    });
}