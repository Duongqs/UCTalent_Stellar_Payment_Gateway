---
phase: implementation
title: Implementation Guide — Cross-Border Disbursement Bridge
description: Technical implementation notes, directory patterns, error handling, and security guidelines for developer reference
feature: cross-border-disbursement
---

# Implementation Guide

## Development Setup

### Prerequisites & Dependencies
- **Rust Toolchain**: `rustup` with target `wasm32-unknown-unknown`
- **Stellar CLI**: Installed locally (`cargo install --locked stellar-cli --features opt`)
- **Node.js**: >= v18.0.0
- **Redis**: Deployed locally or via Docker for BullMQ queue processing
- **Freighter Wallet**: Installed in developer Chrome/Firefox profile for frontend testing

### Environment Variables
Configure the following in the bridge `.env` file (`/Users/admin/repos/uc-cross-border/disbursement-bridge/.env`):
```bash
# Network Config
SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
NETWORK_PASSPHRASE="Test SDF Network ; September 2015"

# Smart Contract IDs
FACTORY_CONTRACT_ID=CA...
USDC_TOKEN_ID=GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5

# Bridge Service Ports
PORT=4000
ANCHOR_DOMAIN=localhost:4000

# Secret Credentials
ANCHOR_SIGNING_KEY=S...
WEBHOOK_SECRET=uctalent-dev-secret-hmac-key

# 9Pay Production Sandbox
NINEPAY_MERCHANT_KEY=...
NINEPAY_SECRET_KEY=...
NINEPAY_CHECKSUM_KEY=...
NINEPAY_BASE_URL=https://sand-payment.9pay.vn
```

---

## Code Structure

The implementation spans two repositories (`uc-cross-border` for contracts and bridge, and `uctalents` for backend integration).

```
uc-cross-border/
├── soroban/                           # Rust Contracts
│   ├── contracts/
│   │   ├── uctalent-factory/          # Escrow Factory
│   │   │   └── src/lib.rs
│   │   ├── uctalent-referral/         # Contract A: Referral Bounty
│   │   │   └── src/lib.rs
│   │   └── uctalent-milestone/        # Contract B: Milestone Payments
│   │       └── src/lib.rs
│   └── Cargo.toml
├── disbursement-bridge/               # Bridge Microservice
│   ├── src/
│   │   ├── listener.js                # Queue poller & parser
│   │   ├── sep31-anchor.js            # Express API & SQLite persistence
│   │   ├── ninepay-client.js          # API Wrapper for 9Pay
│   │   ├── oracle.js                  # Exchange rate fetcher
│   │   └── queue/
│   │       ├── sqlite-queue.js        # Internal local event database queue
│   │       └── processors/
│   │           ├── referral.js
│   │           └── milestone.js
│   └── package.json
```

---

## Implementation Notes

### Smart Contract Execution & Auth Pattern

#### 1. Context Auth Verification
Every function mutating state in the Soroban smart contracts must explicitly check caller permissions using `require_auth()`:
```rust
// In uctalent-referral/src/lib.rs
pub fn deposit(env: Env, client: Address) {
    client.require_auth();
    let config = get_config(&env);
    if client != config.client {
        panic!("Unauthorized client address");
    }
    // ...
}
```

#### 2. Event Struct Format
Soroban events must follow a strict, query-friendly topic format so the listener can filter them.
- **Referral event topics**: `("uctalent", "referral_settled", contract_address)`
- **Milestone event topics**: `("uctalent", "milestone_released", contract_address, index)`

```rust
env.events().publish(
    (
        String::from_str(&env, "uctalent"),
        String::from_str(&env, "referral_settled"),
        env.current_contract_address()
    ),
    (
        gross_amount,
        developer_share,
        scout_share,
        platform_share,
        developer_kyc_hash,
        scout_kyc_hash
    )
);
```

### Event Poller Chunking (Max 5 Filter Limit)
To prevent hitting Stellar's RPC filter limits (`maximum 5 contract IDs per filter`), the event listener must chunk the list of watched contract IDs:

```javascript
// In disbursement-bridge/src/listener.js
async function pollSorobanEvents() {
  const activeContracts = await db.getAllActiveContracts(); // e.g. 12 contracts
  const chunkSize = 5;
  
  for (let i = 0; i < activeContracts.length; i += chunkSize) {
    const chunk = activeContracts.slice(i, i + chunkSize);
    
    const eventResponse = await rpcServer.getEvents({
      startLedger: lastProcessedLedger,
      filters: [{
        type: 'contract',
        contractIds: chunk,
        topics: [
          ['uctalent', 'referral_settled', '*'],
          ['uctalent', 'milestone_released', '*']
        ]
      }]
    });
    
    await processEvents(eventResponse.events);
  }
}
```

---

## Integration Points

### 1. 9Pay Settlement API Integration
We call the 9Pay payout endpoint to trigger bank transfers:
- **Endpoint**: `POST /api/v1/payouts`
- **Authentication**: `Signature` header generated via HMAC-SHA256 of parameters (using `checksumKey`).
- **Rounding Rule**: VND amounts must be rounded to integers (`Math.round()`), as NAPAS does not support fractional Dong.

### 2. Transaction Audit Traceability
Every settlement transaction must store its traceability metadata inside the local SQLite database. Ensure all columns are populated before transitioning state to `cleared`:
- `soroban_tx_hash`: The hash of the on-chain Soroban release transaction
- `ninepay_payment_no`: Reference returned by 9Pay API
- `napas_clearing_id`: Value returned in the successful payout webhook
- `stellar_memo`: Random hex string generated to cross-link the anchor record with the 9Pay transfer

---

## Error Handling & Resiliency

### 1. Idempotency & Re-play Prevention
To prevent double-disbursing fiat payments in case of event reprocessing or network failure:
- Add a unique index on `soroban_tx_hash` in the bridge database.
- Use a `UNIQUE` constraint on the webhook receiver in NestJS backend.
- Before calling 9Pay, check if `soroban_tx_hash` already has a transaction state in `cleared` or `dispatched`.

### 2. Queue Retry with Exponential Backoff
9Pay API calls can fail due to temporary network issues, rate limits, or scheduled banking maintenance:
- Implement a retry mechanism in the BullMQ handler on the UCTalent Backend.
- Retry configuration: 5 attempts, exponential backoff starting at 10 seconds.
- Permanently failing transfers (e.g. invalid bank details) must trigger a webhook back to the NestJS backend to change status to `failed` and alert the operator.

---

## Security Notes

### 1. Webhook Signature Verification
All communications between UCTalent Backend and the Cross-Border Bridge must be protected by HMAC signatures:
```javascript
function verifySignature(req, secret) {
  const signature = req.headers['x-uctalent-signature'];
  const payload = JSON.stringify(req.body);
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  return signature === expectedSignature;
}
```

### 2. On-Chain PII Prevention
Never write bank account numbers, names, or emails directly to the Stellar blockchain.
- Recipient identities must be hashed on-chain using SHA-256 (`BytesN<32>`).
- Raw recipient information is only processed off-chain within the secure bridge database and during the API call to 9Pay.
