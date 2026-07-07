import { query, pool } from '../db';
import * as path from 'path';
import * as fs from 'fs';
import * as dotenv from 'dotenv';

dotenv.config();

export async function migrateSqlite() {
  console.log('🚀 Starting SQLite to PostgreSQL migration...');
  
  // Resolve database path
  let sqlitePath = path.resolve(process.cwd(), 'disbursement-bridge/bridge_queue.db');
  if (!fs.existsSync(sqlitePath)) {
    sqlitePath = path.resolve(process.cwd(), 'bridge_queue.db');
  }

  if (!fs.existsSync(sqlitePath)) {
    console.warn(`⚠️  SQLite file not found at: ${sqlitePath}. No migration performed.`);
    return;
  }

  console.log(`📂 Found SQLite database at: ${sqlitePath}`);

  let Database;
  try {
    Database = require('better-sqlite3');
  } catch (err: any) {
    console.error('❌ Failed to load better-sqlite3 module. Please run: npm install better-sqlite3');
    return;
  }

  const db = new Database(sqlitePath);

  try {
    // Check if table exists in SQLite
    const tableInfo = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='events_queue'").get();
    if (!tableInfo) {
      console.log('⚠️  SQLite table "events_queue" does not exist. Nothing to migrate.');
      return;
    }

    // Query events from SQLite
    const rows = db.prepare("SELECT * FROM events_queue").all() as any[];
    console.log(`📊 Found ${rows.length} rows in legacy SQLite table "events_queue".`);

    let migratedCount = 0;

    for (const row of rows) {
      try {
        const payloadJson = typeof row.payload_json === 'string' ? JSON.parse(row.payload_json) : row.payload_json;
        
        // Map SQLite status to PostgreSQL status (pending, completed, failed)
        let status = 'pending';
        if (row.status === 'completed' || row.status === 'success') {
          status = 'completed';
        } else if (row.status === 'failed') {
          status = 'failed';
        }

        // Insert into PostgreSQL
        await query(
          `INSERT INTO bridge_events_queue (ledger, tx_hash, contract_id, payload_json, status, error_message, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
           ON CONFLICT (tx_hash) DO UPDATE SET
             status = EXCLUDED.status,
             error_message = EXCLUDED.error_message,
             updated_at = NOW()`,
          [
            row.ledger,
            row.tx_hash,
            row.contract_id || 'unknown',
            JSON.stringify(payloadJson),
            status,
            row.error_message || null
          ]
        );
        migratedCount++;
      } catch (rowErr: any) {
        console.error(`❌ Failed migrating row with tx_hash ${row.tx_hash}:`, rowErr.message);
      }
    }

    console.log(`✅ Migration complete. Successfully migrated/updated ${migratedCount} rows to PostgreSQL!`);
  } catch (err: any) {
    console.error('❌ Error executing database migration:', err.message);
  } finally {
    db.close();
  }
}

// If run directly
if (require.main === module) {
  migrateSqlite()
    .then(() => pool.end())
    .catch((err) => {
      console.error('❌ Migration script failed:', err);
      pool.end();
    });
}
