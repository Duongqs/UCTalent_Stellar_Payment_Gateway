"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pool = void 0;
exports.query = query;
exports.queryAll = queryAll;
exports.withTransaction = withTransaction;
exports.checkHealth = checkHealth;
exports.auditLog = auditLog;
const pg_1 = require("pg");
const DATABASE_URL = process.env.DATABASE_URL;
let pool;
if (DATABASE_URL) {
    exports.pool = pool = new pg_1.Pool({
        connectionString: DATABASE_URL,
        max: 10,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 5_000,
    });
}
else {
    const host = process.env.POSTGRES_HOST || 'localhost';
    const port = parseInt(process.env.POSTGRES_PORT || '5432', 10);
    const user = process.env.POSTGRES_USER || 'postgres';
    const password = process.env.POSTGRES_PASSWORD || 'password';
    const database = process.env.POSTGRES_DB || 'uct_cross_border_dev';
    exports.pool = pool = new pg_1.Pool({
        host,
        port,
        user,
        password,
        database,
        max: 10,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 5_000,
    });
}
pool.on('error', (err) => {
    console.error('[DB] Unexpected pool error:', err.message);
});
async function query(text, params) {
    const start = Date.now();
    try {
        const result = await pool.query(text, params);
        const duration = Date.now() - start;
        if (duration > 1000) {
            console.warn(`[DB] Slow query (${duration}ms):`, text.substring(0, 80));
        }
        return result.rows[0] ?? null;
    }
    catch (error) {
        console.error('[DB] Query error:', error.message);
        throw error;
    }
}
async function queryAll(text, params) {
    const result = await pool.query(text, params);
    return result.rows;
}
async function withTransaction(fn) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
    }
    catch (error) {
        await client.query('ROLLBACK');
        throw error;
    }
    finally {
        client.release();
    }
}
async function checkHealth() {
    const start = Date.now();
    try {
        await pool.query('SELECT 1');
        return { status: 'ok', latency_ms: Date.now() - start };
    }
    catch {
        return { status: 'error', latency_ms: Date.now() - start };
    }
}
const SENSITIVE_KEYS = [
    'account_number', 'id_number', 'legal_name',
    'encrypted_account', 'encrypted_name', 'id_number_enc',
];
function sanitizeForLog(obj) {
    if (!obj || typeof obj !== 'object')
        return obj;
    const clean = { ...obj };
    for (const key of SENSITIVE_KEYS) {
        if (key in clean)
            clean[key] = '[REDACTED]';
    }
    return clean;
}
async function auditLog(transactionId, eventType, payload) {
    const safePayload = sanitizeForLog(payload);
    await query(`INSERT INTO disbursement_audit_log (transaction_id, event_type, payload)
     VALUES ($1, $2, $3)`, [transactionId, eventType, JSON.stringify(safePayload)]);
}
exports.default = pool;
//# sourceMappingURL=db.js.map