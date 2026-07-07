const fs = require('fs');
let content = fs.readFileSync('src/sep31-anchor.js', 'utf8');

// Replace DB setup
content = content.replace(
  /\/\/ ─── Persistent database storage \(node:sqlite\) ─────────────────────────────[\s\S]*?const db = new DatabaseSync\('anchor\.db'\);[\s\S]*?db\.exec\([\s\S]*?\);/,
`// ─── Persistent database storage (pg) ─────────────────────────────
const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  user: process.env.POSTGRES_USER || 'uctalent',
  password: process.env.POSTGRES_PASSWORD || 'password',
  database: process.env.POSTGRES_DB || 'uctalent_dev'
});

async function initDB() {
  await pool.query(\`
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
  \`);
}
initDB().catch(console.error);`
);

// Replace saveTransaction
content = content.replace(
  /function saveTransaction\(tx\) {[\s\S]*?stmt\.run\(tx\.id, memo, txHash, kind, dataStr\);\n}/,
`async function saveTransaction(tx) {
  const dataStr = JSON.stringify(tx);
  const memo = tx.stellar_memo || tx.stellarMemo || null;
  const txHash = tx.stellarTxHash || null;
  const kind = tx.kind || null;
  
  await pool.query(\`
    INSERT INTO bridge_transactions (id, stellar_memo, stellar_tx_hash, kind, data)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT(id) DO UPDATE SET
      stellar_memo = EXCLUDED.stellar_memo,
      stellar_tx_hash = EXCLUDED.stellar_tx_hash,
      kind = EXCLUDED.kind,
      data = EXCLUDED.data
  \`, [tx.id, memo, txHash, kind, dataStr]);
}`
);

// Replace getTransactionById
content = content.replace(
  /function getTransactionById\(id\) {[\s\S]*?return row \? JSON\.parse\(row\.data\) : null;\n}/,
`async function getTransactionById(id) {
  const res = await pool.query('SELECT data FROM bridge_transactions WHERE id = $1', [id]);
  return res.rows[0] ? res.rows[0].data : null;
}`
);

// Replace getTransactionByClearingId
content = content.replace(
  /function getTransactionByClearingId\(clearingId\) {[\s\S]*?return row \? JSON\.parse\(row\.data\) : null;\n}/,
`async function getTransactionByClearingId(clearingId) {
  const res = await pool.query("SELECT data FROM bridge_transactions WHERE data->>'clearingId' = $1", [clearingId]);
  return res.rows[0] ? res.rows[0].data : null;
}`
);

// Replace getSep31TransactionByMemo
content = content.replace(
  /function getSep31TransactionByMemo\(memo\) {[\s\S]*?return row \? JSON\.parse\(row\.data\) : null;\n}/,
`async function getSep31TransactionByMemo(memo) {
  const res = await pool.query("SELECT data FROM bridge_transactions WHERE stellar_memo = $1 AND kind = 'receive'", [memo]);
  return res.rows[0] ? res.rows[0].data : null;
}`
);

// Replace getSplitsByStellarTxHash
content = content.replace(
  /function getSplitsByStellarTxHash\(txHash\) {[\s\S]*?return rows\.map\(r => JSON\.parse\(r\.data\)\);\n}/,
`async function getSplitsByStellarTxHash(txHash) {
  const res = await pool.query("SELECT data FROM bridge_transactions WHERE stellar_tx_hash = $1 AND kind IS NULL", [txHash]);
  return res.rows.map(r => r.data);
}`
);

// Replace getSiblingsByStellarMemo
content = content.replace(
  /function getSiblingsByStellarMemo\(memo\) {[\s\S]*?return rows\.map\(r => JSON\.parse\(r\.data\)\);\n}/,
`async function getSiblingsByStellarMemo(memo) {
  const res = await pool.query("SELECT data FROM bridge_transactions WHERE stellar_memo = $1 AND kind IS NULL", [memo]);
  return res.rows.map(r => r.data);
}`
);

// Now replace synchronous calls with await
// 1. app.post('/sep31/transactions'
content = content.replace(
  /app\.post\('\/sep31\/transactions', \(req, res\) => {/,
  "app.post('/sep31/transactions', async (req, res) => {"
);
content = content.replace(/saveTransaction\(newTx\);/g, "await saveTransaction(newTx);");

// 2. app.get('/sep31/transactions/:id'
content = content.replace(
  /app\.get\('\/sep31\/transactions\/:id', \(req, res\) => {/,
  "app.get('/sep31/transactions/:id', async (req, res) => {"
);
content = content.replace(/const tx = getTransactionById\(id\);/g, "const tx = await getTransactionById(id);");

// 3. /api/anchor/disburse
content = content.replace(/const matchingTx = getSep31TransactionByMemo\(payload\.stellarMemo\);/g, "const matchingTx = await getSep31TransactionByMemo(payload.stellarMemo);");
content = content.replace(/saveTransaction\(matchingTx\);/g, "await saveTransaction(matchingTx);");
content = content.replace(/saveTransaction\(record\);/g, "await saveTransaction(record);");
content = content.replace(/saveTransaction\(tx\);/g, "await saveTransaction(tx);");
content = content.replace(/const existingSiblings = getSiblingsByStellarMemo\(payload\.stellarMemo\);/g, "const existingSiblings = await getSiblingsByStellarMemo(payload.stellarMemo);");

// 4. /api/9pay/callback
content = content.replace(
  /app\.post\('\/api\/9pay\/callback', \(req, res\) => {/,
  "app.post('/api/9pay/callback', async (req, res) => {"
);
content = content.replace(/const tx = getTransactionByClearingId\(clearingId\);/g, "const tx = await getTransactionByClearingId(clearingId);");
content = content.replace(/const parentSep31Tx = getSep31TransactionByMemo\(tx\.stellarMemo\);/g, "const parentSep31Tx = await getSep31TransactionByMemo(tx.stellarMemo);");
content = content.replace(/const siblings = getSplitsByStellarTxHash\(tx\.stellarTxHash\);/g, "const siblings = await getSplitsByStellarTxHash(tx.stellarTxHash);");
content = content.replace(/saveTransaction\(parentSep31Tx\);/g, "await saveTransaction(parentSep31Tx);");

fs.writeFileSync('src/sep31-anchor.js', content, 'utf8');
console.log('Migration to pg complete.');
