const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
  user: process.env.POSTGRES_USER || 'uctalent',
  password: process.env.POSTGRES_PASSWORD || 'password',
  database: process.env.POSTGRES_DB || 'uctalent_dev'
});

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bridge_transactions (
      id TEXT PRIMARY KEY,
      stellar_memo TEXT,
      stellar_tx_hash TEXT,
      kind TEXT,
      data JSONB
    );
    CREATE INDEX IF NOT EXISTS idx_bridge_tx_memo ON bridge_transactions(stellar_memo);
    CREATE INDEX IF NOT EXISTS idx_bridge_tx_hash ON bridge_transactions(stellar_tx_hash);
    CREATE INDEX IF NOT EXISTS idx_bridge_tx_clearing ON bridge_transactions((data->>'clearingId'));
  `);
}
initDB().catch(console.error);

async function saveTransaction(tx) {
  const dataStr = JSON.stringify(tx);
  const memo = tx.stellar_memo || tx.stellarMemo || null;
  const txHash = tx.stellarTxHash || null;
  const kind = tx.kind || null;
  
  await pool.query(`
    INSERT INTO bridge_transactions (id, stellar_memo, stellar_tx_hash, kind, data)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT(id) DO UPDATE SET
      stellar_memo = EXCLUDED.stellar_memo,
      stellar_tx_hash = EXCLUDED.stellar_tx_hash,
      kind = EXCLUDED.kind,
      data = EXCLUDED.data
  `, [tx.id, memo, txHash, kind, dataStr]);
}

async function getTransactionById(id) {
  const res = await pool.query('SELECT data FROM bridge_transactions WHERE id = $1', [id]);
  return res.rows[0] ? res.rows[0].data : null;
}

async function getTransactionByClearingId(clearingId) {
  const res = await pool.query("SELECT data FROM bridge_transactions WHERE data->>'clearingId' = $1", [clearingId]);
  return res.rows[0] ? res.rows[0].data : null;
}

async function getSep31TransactionByMemo(memo) {
  const res = await pool.query("SELECT data FROM bridge_transactions WHERE stellar_memo = $1 AND kind = 'receive'", [memo]);
  return res.rows[0] ? res.rows[0].data : null;
}

async function getSplitsByStellarTxHash(txHash) {
  const res = await pool.query("SELECT data FROM bridge_transactions WHERE stellar_tx_hash = $1 AND kind IS NULL", [txHash]);
  return res.rows.map(r => r.data);
}

async function getSiblingsByStellarMemo(memo) {
  const res = await pool.query("SELECT data FROM bridge_transactions WHERE stellar_memo = $1 AND kind IS NULL", [memo]);
  return res.rows.map(r => r.data);
}

module.exports = {
  pool,
  saveTransaction,
  getTransactionById,
  getTransactionByClearingId,
  getSep31TransactionByMemo,
  getSplitsByStellarTxHash,
  getSiblingsByStellarMemo
};
