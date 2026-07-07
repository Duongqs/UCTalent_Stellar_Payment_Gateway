/**
 * UC Talent — Unified Dual-Rail Disbursement Bridge Server
 * Starts the Express SEP-31 Anchor API and the Stellar Soroban SDP Event Listener concurrently.
 */

console.log('⚡ Initializing UC Talent Unified Disbursement Bridge...');

// Start the SEP-31 Anchor API Server
require('./sep31-anchor.js');

// Start the Soroban SDP Event Listener Polling Loop
require('./listener.js');
