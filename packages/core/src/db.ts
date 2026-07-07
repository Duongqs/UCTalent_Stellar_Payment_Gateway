import { Pool, PoolClient } from 'pg';

// ─── Connection Pool ──────────────────────────────────────────────────────────

const DATABASE_URL = process.env.DATABASE_URL;
let pool: Pool;

if (DATABASE_URL) {
  pool = new Pool({
    connectionString: DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
} else {
  // Fallback to separate parameters matching disbursement-bridge legacy config
  const host = process.env.POSTGRES_HOST || 'localhost';
  const port = parseInt(process.env.POSTGRES_PORT || '5432', 10);
  const user = process.env.POSTGRES_USER || 'postgres';
  const password = process.env.POSTGRES_PASSWORD || 'password';
  const database = process.env.POSTGRES_DB || 'uct_cross_border_dev';

  pool = new Pool({
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

// ─── Query Helper ─────────────────────────────────────────────────────────────

export async function query<T = any>(
  text: string,
  params?: any[]
): Promise<T | null> {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    if (duration > 1000) {
      console.warn(`[DB] Slow query (${duration}ms):`, text.substring(0, 80));
    }
    return (result.rows[0] as T) ?? null;
  } catch (error: any) {
    console.error('[DB] Query error:', error.message);
    throw error;
  }
}

export async function queryAll<T = any>(
  text: string,
  params?: any[]
): Promise<T[]> {
  const result = await pool.query(text, params);
  return result.rows as T[];
}

// ─── Transaction Helper ───────────────────────────────────────────────────────

export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// ─── Health Check ─────────────────────────────────────────────────────────────

export async function checkHealth(): Promise<{ status: string; latency_ms: number }> {
  const start = Date.now();
  try {
    await pool.query('SELECT 1');
    return { status: 'ok', latency_ms: Date.now() - start };
  } catch {
    return { status: 'error', latency_ms: Date.now() - start };
  }
}

// ─── Audit Log (append-only) ──────────────────────────────────────────────────

const SENSITIVE_KEYS = [
  'account_number', 'id_number', 'legal_name',
  'encrypted_account', 'encrypted_name', 'id_number_enc',
];

function sanitizeForLog(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  const clean = { ...obj };
  for (const key of SENSITIVE_KEYS) {
    if (key in clean) clean[key] = '[REDACTED]';
  }
  return clean;
}

export async function auditLog(
  transactionId: string,
  eventType: string,
  payload: Record<string, any>
): Promise<void> {
  const safePayload = sanitizeForLog(payload);
  await query(
    `INSERT INTO disbursement_audit_log (transaction_id, event_type, payload)
     VALUES ($1, $2, $3)`,
    [transactionId, eventType, JSON.stringify(safePayload)]
  );
}

export default pool;
export { pool };
