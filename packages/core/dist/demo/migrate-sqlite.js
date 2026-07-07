"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.migrateSqlite = migrateSqlite;
const db_1 = require("../db");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const dotenv = __importStar(require("dotenv"));
dotenv.config();
async function migrateSqlite() {
    console.log('🚀 Starting SQLite to PostgreSQL migration...');
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
    }
    catch (err) {
        console.error('❌ Failed to load better-sqlite3 module. Please run: npm install better-sqlite3');
        return;
    }
    const db = new Database(sqlitePath);
    try {
        const tableInfo = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='events_queue'").get();
        if (!tableInfo) {
            console.log('⚠️  SQLite table "events_queue" does not exist. Nothing to migrate.');
            return;
        }
        const rows = db.prepare("SELECT * FROM events_queue").all();
        console.log(`📊 Found ${rows.length} rows in legacy SQLite table "events_queue".`);
        let migratedCount = 0;
        for (const row of rows) {
            try {
                const payloadJson = typeof row.payload_json === 'string' ? JSON.parse(row.payload_json) : row.payload_json;
                let status = 'pending';
                if (row.status === 'completed' || row.status === 'success') {
                    status = 'completed';
                }
                else if (row.status === 'failed') {
                    status = 'failed';
                }
                await (0, db_1.query)(`INSERT INTO bridge_events_queue (ledger, tx_hash, contract_id, payload_json, status, error_message, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
           ON CONFLICT (tx_hash) DO UPDATE SET
             status = EXCLUDED.status,
             error_message = EXCLUDED.error_message,
             updated_at = NOW()`, [
                    row.ledger,
                    row.tx_hash,
                    row.contract_id || 'unknown',
                    JSON.stringify(payloadJson),
                    status,
                    row.error_message || null
                ]);
                migratedCount++;
            }
            catch (rowErr) {
                console.error(`❌ Failed migrating row with tx_hash ${row.tx_hash}:`, rowErr.message);
            }
        }
        console.log(`✅ Migration complete. Successfully migrated/updated ${migratedCount} rows to PostgreSQL!`);
    }
    catch (err) {
        console.error('❌ Error executing database migration:', err.message);
    }
    finally {
        db.close();
    }
}
if (require.main === module) {
    migrateSqlite()
        .then(() => db_1.pool.end())
        .catch((err) => {
        console.error('❌ Migration script failed:', err);
        db_1.pool.end();
    });
}
//# sourceMappingURL=migrate-sqlite.js.map