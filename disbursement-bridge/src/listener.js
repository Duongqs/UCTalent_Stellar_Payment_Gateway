'use strict';

const { rpc, scValToNative } = require('@stellar/stellar-sdk');
const axios = require('axios');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const path = require('path');
require('dotenv').config();

// ── Configuration ────────────────────────────────────────────────────────────
const RPC_URL = process.env.SOROBAN_RPC_URL || 'https://rpc-testnet.stellar.org';
const CONTRACT_ID = process.env.ESCROW_CONTRACT_ID;
const WEBHOOK_URL = process.env.SEP31_WEBHOOK_URL || 'http://localhost:3000/api/webhooks/sdp';
const WEBHOOK_SECRET = process.env.CROSS_BORDER_WEBHOOK_SECRET || 'uctalent-dev-secret';
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || '5000', 10);
const PROCESS_INTERVAL_MS = parseInt(process.env.PROCESS_INTERVAL_MS || '2000', 10);
const TOKEN_DECIMALS = parseInt(process.env.TOKEN_DECIMALS || '7', 10);
const STROOP_DIVISOR = Math.pow(10, TOKEN_DECIMALS);

if (!CONTRACT_ID) {
  console.error('❌  ESCROW_CONTRACT_ID is not set in .env — cannot listen for events.');
  process.exit(1);
}

const watchedContracts = [CONTRACT_ID];
const rpcServer = new rpc.Server(RPC_URL);

// ── Database Setup ────────────────────────────────────────────────────────────
const dbPath = path.join(__dirname, '..', 'bridge_queue.db');
const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS state (
    key TEXT PRIMARY KEY,
    value TEXT
  );
  CREATE TABLE IF NOT EXISTS events_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ledger INTEGER,
    tx_hash TEXT,
    contract_id TEXT,
    payload_json TEXT,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

console.log('══════════════════════════════════════════════════════════');
console.log('📡  UCTalent Soroban Event Listener (Queue-Based)');
console.log(`🔗  RPC         : ${RPC_URL}`);
console.log(`📜  Factory     : ${CONTRACT_ID}`);
console.log(`📮  Webhook     : ${WEBHOOK_URL}`);
console.log(`💾  Database    : ${dbPath}`);
console.log(`⏱️   Poll interval: ${POLL_INTERVAL_MS} ms`);
console.log('══════════════════════════════════════════════════════════');

// ── Helpers ──────────────────────────────────────────────────────────────────

function toNative(scValOrBase64) {
  try {
    const { xdr } = require('@stellar/stellar-sdk');
    let scVal = scValOrBase64;
    if (typeof scVal === 'string') {
      scVal = xdr.ScVal.fromXDR(scVal, 'base64');
    } else if (scVal && scVal.xdr) {
      scVal = xdr.ScVal.fromXDR(scVal.xdr, 'base64');
    }
    return scValToNative(scVal);
  } catch (_err) { return null; }
}

function stroopsToUsdc(stroops) {
  return Number(BigInt(stroops || 0)) / STROOP_DIVISOR;
}

function signPayload(data) {
  return 'sha256=' + crypto.createHmac('sha256', WEBHOOK_SECRET).update(data).digest('hex');
}

function getLastProcessedLedger() {
  const row = db.prepare('SELECT value FROM state WHERE key = ?').get('last_processed_ledger');
  return row ? parseInt(row.value, 10) : 0;
}

function setLastProcessedLedger(ledger) {
  db.prepare(`
    INSERT INTO state (key, value) VALUES ('last_processed_ledger', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(ledger.toString());
}

// ── Producer (Poller) ─────────────────────────────────────────────────────────

async function pollSorobanEvents() {
  let lastProcessedLedger = getLastProcessedLedger();

  if (lastProcessedLedger === 0) {
    try {
      const status = await rpcServer.getLatestLedger();
      lastProcessedLedger = status.sequence;
      setLastProcessedLedger(lastProcessedLedger);
      console.log(`[Poller] Initialized at ledger ${lastProcessedLedger}. Watching for events...`);
    } catch (err) {
      console.error('[Poller] Failed to get latest ledger:', err.message);
    }
  } else {
    console.log(`[Poller] Resuming from ledger ${lastProcessedLedger}...`);
  }

  // Discover historical contracts
  try {
    const historyResponse = await rpcServer.getEvents({
      startLedger: Math.max(0, lastProcessedLedger - 15000),
      filters: [{ type: 'contract', contractIds: [CONTRACT_ID] }],
      limit: 100,
    });
    const historyEvents = historyResponse?.events || [];
    for (const event of historyEvents) {
      const topics = event.topic || [];
      if (topics.length >= 2) {
        try {
          const t0 = toNative(topics[0]);
          const t1 = toNative(topics[1]);
          if (t0 === 'uctalent_factory' && t1 === 'escrow_created') {
            const childAddr = toNative(event.value);
            if (childAddr && !watchedContracts.includes(childAddr)) {
              watchedContracts.push(childAddr);
            }
          }
        } catch (_) {}
      }
    }
    console.log(`[Poller] History scan complete. Total watched contracts: ${watchedContracts.length}`);
  } catch (err) {
    console.error('[Poller] Historical scan failed:', err.message);
  }

  setInterval(async () => {
    try {
      const latest = await rpcServer.getLatestLedger();
      const currentLedger = latest.sequence;

      if (currentLedger <= lastProcessedLedger) return;

      const uniqueContracts = [...new Set([CONTRACT_ID, ...watchedContracts])];
      const filters = [];
      for (let i = 0; i < uniqueContracts.length; i += 5) {
        filters.push({
          type: 'contract',
          contractIds: uniqueContracts.slice(i, i + 5)
        });
      }

      const response = await rpcServer.getEvents({
        startLedger: lastProcessedLedger + 1, // Start from the next ledger to avoid overlap
        filters: filters,
        limit: 100,
      });

      const events = response?.events || [];
      if (events.length > 0) {
        console.log(`\n[Poller] Ledger ${lastProcessedLedger} → ${currentLedger}: found ${events.length} event(s)`);
      }

      for (const event of events) {
        await enqueueEvent(event);
      }

      lastProcessedLedger = currentLedger;
      setLastProcessedLedger(currentLedger);
    } catch (err) {
      console.error('[Poller] error:', err.stack || err.message);
    }
  }, POLL_INTERVAL_MS);
}

async function enqueueEvent(event) {
  const topics = event.topic || [];
  if (topics.length < 2) return;

  if (event.contractId.toString() === CONTRACT_ID) {
    try {
      const t0 = toNative(topics[0]);
      const t1 = toNative(topics[1]);
      if (t0 === 'uctalent_factory' && t1 === 'escrow_created') {
        const childAddr = toNative(event.value);
        if (childAddr && !watchedContracts.includes(childAddr)) {
          watchedContracts.push(childAddr);
          console.log(`🌟 [Poller] Discovered child contract: ${childAddr}`);
          await scanChildContractEvents(childAddr, event.ledger);
        }
      }
    } catch (e) {}
    return;
  }

  let t0, t1;
  try {
    t0 = toNative(topics[0]);
    t1 = topics.length > 1 ? toNative(topics[1]) : '';
    if (!(t0 === 'uctalent' && (t1 === 'referral_settled' || t1 === 'milestone_released'))) {
      return;
    }
  } catch(e) { return; }

  const decoded = toNative(event.value);
  if (!Array.isArray(decoded)) return;

  const payload = {
    stellarTxHash: event.txHash,
    stellarMemo: `UCT_${event.ledger}_${event.txHash.substring(0, 8).toUpperCase()}`,
    ledgerSequence: event.ledger,
    timestamp: new Date().toISOString()
  };

  if (t1 === 'referral_settled') {
    if (decoded.length < 6) return;
    const [jobIdRaw, recipientRaw, bountyRaw, scoutShareRaw, platformShareRaw, scoutKycId] = decoded;
    
    payload.trackingId = typeof jobIdRaw === 'string' ? jobIdRaw : (Buffer.isBuffer(jobIdRaw) ? jobIdRaw.toString() : String(jobIdRaw));
    payload.recipient = typeof recipientRaw === 'string' ? recipientRaw : String(recipientRaw);
    payload.bountyAmount = stroopsToUsdc(bountyRaw);
    payload.splits = {
      scout: { amountUsdc: stroopsToUsdc(scoutShareRaw), kycId: Buffer.isBuffer(scoutKycId) ? scoutKycId.toString('hex') : String(scoutKycId) },
      platform: { amountUsdc: stroopsToUsdc(platformShareRaw), kycId: null }
    };
  } else if (t1 === 'milestone_released') {
    if (decoded.length < 4) return;
    const [gigIdRaw, indexRaw, amountRaw, freelancerRaw] = decoded;
    
    payload.trackingId = typeof gigIdRaw === 'string' ? gigIdRaw : (Buffer.isBuffer(gigIdRaw) ? gigIdRaw.toString() : String(gigIdRaw));
    payload.milestoneIndex = Number(indexRaw);
    payload.recipient = typeof freelancerRaw === 'string' ? freelancerRaw : String(freelancerRaw);
    payload.bountyAmount = stroopsToUsdc(amountRaw);
    payload.splits = {
      talent: { amountUsdc: stroopsToUsdc(amountRaw), kycId: null }
    };
  }

  // Push to SQLite
  try {
    // Prevent duplicate enqueues by checking if tx_hash already exists
    const existing = db.prepare('SELECT id FROM events_queue WHERE tx_hash = ?').get(event.txHash);
    if (!existing) {
      db.prepare(`INSERT INTO events_queue (ledger, tx_hash, contract_id, payload_json) VALUES (?, ?, ?, ?)`).run(
        event.ledger, event.txHash, event.contractId.toString(), JSON.stringify(payload)
      );
      console.log(`📥 [Poller] Queued event from ${event.txHash} (Ledger ${event.ledger})`);
    }
  } catch (err) {
    console.error(`❌ [Poller] Failed to queue event:`, err.message);
  }
}

async function scanChildContractEvents(childAddr, startLedger) {
  try {
    const response = await rpcServer.getEvents({
      startLedger: startLedger,
      filters: [{ type: 'contract', contractIds: [childAddr] }],
      limit: 10,
    });
    for (const ev of response?.events || []) {
      await enqueueEvent(ev);
    }
  } catch (err) {
    console.error(`[Poller] Post-discovery scan failed for ${childAddr}:`, err.message);
  }
}

// ── Consumer (Processor) ──────────────────────────────────────────────────────

async function processQueue() {
  setInterval(async () => {
    const row = db.prepare(`SELECT * FROM events_queue WHERE status = 'pending' ORDER BY id ASC LIMIT 1`).get();
    if (!row) return;

    console.log(`\n📮 [Consumer] Processing queued event #${row.id} (Tx: ${row.tx_hash})`);
    
    try {
      const payload = JSON.parse(row.payload_json);
      const payloadString = JSON.stringify(payload);
      const signature = signPayload(payloadString);

      const res = await axios.post(WEBHOOK_URL, payload, {
        headers: { 'Content-Type': 'application/json', 'X-UCTALENT-SIGNATURE': signature },
        timeout: 10_000,
      });

      console.log(`   ✅ Anchor responded ${res.status}:`, JSON.stringify(res.data).substring(0, 200));
      
      // Mark as completed
      db.prepare(`UPDATE events_queue SET status = 'completed' WHERE id = ?`).run(row.id);
    } catch (err) {
      const status = err.response?.status || 'N/A';
      console.error(`   ❌ Webhook dispatch failed (HTTP ${status}):`, err.message);
      // Mark as failed so it can be retried or inspected later
      db.prepare(`UPDATE events_queue SET status = 'failed' WHERE id = ?`).run(row.id);
    }
  }, PROCESS_INTERVAL_MS);
}

// ── Boot ──────────────────────────────────────────────────────────────────────
pollSorobanEvents();
processQueue();
