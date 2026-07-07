const axios = require('axios');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');

const ANCHOR_URL = 'http://localhost:4000';
const WEBHOOK_SECRET = 'uctalent-dev-secret-change-in-production';

const runId = Math.random().toString(36).substring(2, 8);

function createSignature(stellarTxHash) {
  return 'sha256=' + crypto.createHmac('sha256', WEBHOOK_SECRET).update(stellarTxHash).digest('hex');
}

async function testReferralEvent() {
  console.log('--- Testing Referral Event (2.4.1) ---');
  const txHash = 'bypass-rpc-check-for-testing-purpose-1-' + runId;
  const payload = {
    bountyAmount: 1000,
    stellarTxHash: txHash,
    stellarMemo: 'referral_' + txHash.substring(0, 10),
    ledgerSequence: 100001,
    splits: {
      scout: { amountUsdc: 800, kycId: 'scout_001' }
    }
  };

  try {
    const res = await axios.post(`${ANCHOR_URL}/api/anchor/disburse`, payload, {
      headers: {
        'x-uctalent-signature': createSignature(txHash)
      }
    });
    console.log('POST /api/anchor/disburse returned:', res.status);
    if (res.status !== 200) throw new Error('Failed to disburse');
    
    // Check DB
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // We can also poll the internal db or check API.
    // The anchor exposes /api/anchor/transactions
    const txsRes = await axios.get(`${ANCHOR_URL}/api/anchor/transactions`);
    const txs = txsRes.data;
    const found = txs.find(t => t.stellarTxHash === txHash);
    if (!found) throw new Error('Transaction not found in anchor DB');
    console.log('✅ PASS: Transaction successfully registered in Anchor DB.');
  } catch (error) {
    console.error('❌ FAIL:', error.response?.data || error.message);
    process.exit(1);
  }
}

async function testMilestoneEvent() {
  console.log('--- Testing Milestone Event (2.4.2) ---');
  const txHash = 'bypass-rpc-check-for-testing-purpose-2-' + runId;
  const payload = {
    bountyAmount: 500,
    stellarTxHash: txHash,
    stellarMemo: 'milestone_' + txHash.substring(0, 10),
    ledgerSequence: 100002,
    splits: {
      talent: { amountUsdc: 400, kycId: 'talent_001' }
    }
  };

  try {
    const res = await axios.post(`${ANCHOR_URL}/api/anchor/disburse`, payload, {
      headers: {
        'x-uctalent-signature': createSignature(txHash)
      }
    });
    console.log('POST /api/anchor/disburse returned:', res.status);
    if (res.status !== 200) throw new Error('Failed to disburse');
    
    // Check DB
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const txsRes = await axios.get(`${ANCHOR_URL}/api/anchor/transactions`);
    const found = txsRes.data.find(t => t.stellarTxHash === txHash);
    if (!found) throw new Error('Transaction not found in anchor DB');
    console.log('✅ PASS: Milestone transaction successfully registered in Anchor DB.');
  } catch (error) {
    console.error('❌ FAIL:', error.response?.data || error.message);
    process.exit(1);
  }
}

async function testRetryDeadLetterEvent() {
  console.log('--- Testing 9Pay Failure Retry & Dead Letter (2.4.3) ---');
  const txHash = 'bypass-rpc-check-for-testing-purpose-3-' + runId;
  const payload = {
    bountyAmount: 500,
    stellarTxHash: txHash,
    stellarMemo: 'dlq_' + txHash.substring(0, 10),
    ledgerSequence: 100003,
    splits: {
      talent: { amountUsdc: 400, kycId: 'invalid_kyc_triggers_0000000000' }
    }
  };

  try {
    const res = await axios.post(`${ANCHOR_URL}/api/anchor/disburse`, payload, {
      headers: {
        'x-uctalent-signature': createSignature(txHash)
      }
    });
    if (res.status !== 200) throw new Error('Failed to disburse');
    
    // Wait for retries to exhaust (5 attempts, exponentially backed off, max 30s)
    // Actually, retry delays: 2s, 4s, 8s, 16s = ~30s. We need to wait ~32 seconds.
    console.log('Waiting 35s for retries to exhaust...');
    await new Promise(resolve => setTimeout(resolve, 35000));
    
    const txsRes = await axios.get(`${ANCHOR_URL}/api/anchor/transactions`);
    const found = txsRes.data.find(t => t.stellarTxHash === txHash);
    if (!found) throw new Error('Transaction not found in anchor DB');
    if (found.status === 'dead_letter') {
       console.log('✅ PASS: Transaction successfully moved to dead_letter.');
    } else {
       throw new Error('Transaction is not dead_letter. Status: ' + found.status);
    }
  } catch (error) {
    console.error('❌ FAIL:', error.response?.data || error.message);
    process.exit(1);
  }
}

async function testFixedRateEvent() {
  console.log('--- Testing Fixed Rate from Off-chain Median Oracle (2.4.4) ---');
  const txHash = 'bypass-rpc-check-for-testing-purpose-rate-' + runId;
  const payload = {
    bountyAmount: 500,
    stellarTxHash: txHash,
    stellarMemo: 'rate_' + txHash.substring(0, 10),
    ledgerSequence: 100004,
    splits: {
      talent: { amountUsdc: 400, kycId: 'talent_001' }
    }
  };

  try {
    const res = await axios.post(`${ANCHOR_URL}/api/anchor/disburse`, payload, {
      headers: {
        'x-uctalent-signature': createSignature(txHash)
      }
    });
    console.log('POST /api/anchor/disburse returned:', res.status);
    if (res.status !== 200) throw new Error('Failed to disburse');
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const txsRes = await axios.get(`${ANCHOR_URL}/api/anchor/transactions`);
    const found = txsRes.data.find(t => t.stellarTxHash === txHash);
    if (!found) throw new Error('Transaction not found in anchor DB');
    
    console.log(`Checking transaction uses fallback rate...`);
    if (found.fxRate > 0) {
       console.log(`✅ PASS: Transaction has valid fxRate: ${found.fxRate}`);
    } else {
       throw new Error(`Invalid fxRate: ${found.fxRate}`);
    }
  } catch (error) {
    console.error('❌ FAIL:', error.response?.data || error.message);
    process.exit(1);
  }
}

async function runTests() {
  console.log('Starting E2E Tests for Disbursement Bridge...\n');
  await testReferralEvent();
  console.log('');
  await testMilestoneEvent();
  console.log('');
  await testFixedRateEvent();
  console.log('');
  await testRetryDeadLetterEvent();
  console.log('\nAll E2E tests passed!');
}

runTests();
