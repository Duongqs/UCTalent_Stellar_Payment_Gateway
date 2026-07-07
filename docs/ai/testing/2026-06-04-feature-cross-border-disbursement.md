---
phase: testing
title: Testing Strategy — Cross-Border Disbursement Bridge
description: Testing scope, unit tests for Soroban contracts, integration testing for bridge, E2E user flows, and manual validation checklist
feature: cross-border-disbursement
---

# Testing Strategy

## Test Coverage Goals

- **Soroban Contracts**: 100% test coverage for all entry points (`init`, `deposit`, `release`, `refund`) including edge cases.
- **Bridge Service**: 90%+ branch coverage for `listener.js` and `sep31-anchor.js` (using mock 9Pay endpoints).
- **Integration Coverage**: Fully automated test validation of the 4-way audit trail matching in SQLite database.

---

## Unit Tests

### 1. Smart Contracts (`soroban/contracts/uctalent-escrow/src/test.rs`)
- [ ] **TC-1.1**: Test initial configurations stored correctly post-init (client, platform address, platform rate).
- [ ] **TC-1.2**: Test `deposit` transfers the correct amount of tokens from Client to contract vault.
- [ ] **TC-1.3**: Test double deposit fails with panic.
- [ ] **TC-1.4**: Test `release_bounty` correctly transfers 20% platform share to Platform Treasury, and 80% to Anchor address.
- [ ] **TC-1.5**: Test `release_bounty` fails if either client or candidate signature is missing.
- [ ] **TC-1.6**: Test `refund` reclaims full escrow amount to Client wallet post-expiry ledger.
- [ ] **TC-1.7**: Test `refund` fails if contract has not expired yet.
- [ ] **TC-1.8**: Test Milestone Contract: individual milestone releases split fee correctly.
- [ ] **TC-1.9**: Test Milestone Contract: cancelling early refunds only unreleased milestones.

### 2. Event Listener (`disbursement-bridge/src/listener.test.js`)
- [ ] **TC-2.1**: Test chunking logic divides 12 contracts into arrays of size ≤5.
- [ ] **TC-2.2**: Test listener ignores events from unauthorized contracts.
- [ ] **TC-2.3**: Test ledger tracking commits state correctly on successful event processing.

---

## Integration Tests

- [ ] **INT-1: Listener to Anchor Webhook Flow**
  - Trigger mock Soroban event.
  - Verify listener catches event, generates HMAC signature, and POSTs to `/api/anchor/disburse`.
  - Assert HTTP 200 and transaction is stored in SQLite database as `pending`.
  
- [ ] **INT-2: 9Pay API Integration**
  - Call `ninepay-client.js` methods with test tokens/credentials.
  - Verify payload hashing (HMAC-SHA256 signature).
  - Verify response formatting matches 9Pay API documentation.

- [ ] **INT-3: End-to-End Tracing Validation**
  - Run full bridge with simulated Stellar Horizon server.
  - Assert that completing a mock payout creates a SQLite row where all 4 IDs (`id`, `soroban_tx_hash`, `ninepay_payment_no`, `napas_clearing_id`) are populated and cross-referenced.

---

## Manual Testing Checklist

### 1. Wallet Interaction (Freighter)
- [ ] Connect Freighter wallet to Stellar Testnet.
- [ ] Verify error handles correctly if Freighter has no USDC trustline established.
- [ ] Verify automatic prompt opens to add USDC trustline before funding.
- [ ] Verify path payment successfully swaps XLM → USDC if client balance of USDC is zero.

### 2. Payout Validation (9Pay Sandbox)
- [ ] Perform full flow on sandbox and confirm receipt of webhook from 9Pay.
- [ ] Assert status updates to `cleared` in database upon receiving 9Pay callback.
- [ ] Verify integer check: transfer of $29.50 USDC converts to integers in VND without decimals (round up/down correctly).

---

## Performance & Load Testing
- **Concurrency Test**: Spawn 100 child escrow contracts. Trigger releases concurrently.
  - Expected Outcome: Listener processes events in chunked blocks of 5 without RPC timeouts, HTTP errors, or deadlocks.
- **Audit Logging**: Confirm SQLite stays stable under write-heavy loads (utilize Write-Ahead Logging mode).
