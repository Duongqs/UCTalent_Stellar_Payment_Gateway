---
phase: monitoring
title: Monitoring & Observability — Cross-Border Disbursement Bridge
description: Tracking metrics, logging strategies, critical alerts, and health check endpoints for production operations
feature: cross-border-disbursement
---

# Monitoring & Observability

## Key Metrics

### Performance Metrics
- **Event Latency**: Time elapsed from Soroban transaction completion to webhook receipt at the backend. Target: `< 15 seconds`.
- **Settlement Velocity**: Time elapsed from webhook receipt to 9Pay callback success. Target: `< 3 minutes`.
- **Stellar RPC Latency**: Average time per request to `getEvents` or transaction simulations. Target: `< 2 seconds`.

### Business Metrics
- **Total Value Locked (TVL)**: Sum of USDC locked across all active child contracts.
- **Settled Count & Value**: Daily number of payouts and total USDC/VND disbursed.
- **FX Spread**: Difference between oracle rate and 9Pay conversion rate.

### Error Metrics
- **Listener Errors**: Frequency of Soroban RPC polling timeouts or filter failures.
- **Payout Webhook Failures**: HTTP status codes `5xx` or `4xx` returned from UCTalent Backend to Event Listener webhook.
- **9Pay Failures**: Callback failure statuses (`9Pay response != 00`).

---

## Logging Strategy

### Structured Logging Format
All bridge components must output logs in JSON format to stdout for easy aggregation:
```json
{
  "timestamp": "2026-06-04T16:02:00Z",
  "level": "INFO",
  "service": "disbursement-bridge",
  "module": "listener",
  "message": "Processed Soroban events from ledger 104523",
  "meta": {
    "ledger": 104523,
    "eventCount": 3,
    "durationMs": 412
  }
}
```

### Traceability ID Context
Ensure every log associated with a payout includes the `soroban_tx_hash` and `stellar_memo` as tracking tags to enable E2E correlation.

---

## Alerts & Notifications

### Critical Alerts (P1 - PagerDuty / Slack)
- **Stellar RPC Down**: No response from Soroban RPC for > 2 minutes.
- **Vault B Insufficient Funds**: 9Pay API returns balance error code (`9Pay balance < threshold`).
- **Bridge Webhook Tampered**: HMAC validation fails on more than 3 consecutive webhook payloads.

### Warning Alerts (P2 - Email / Slack)
- **Settlement Lag**: Payout stays in `dispatched` state for > 5 minutes without callback.
- **Oracle Stale**: Exchange rate feed has not been updated in > 10 minutes.
- **Failed Escrow Refunds**: Client attempts to refund but transaction fails.

---

## Health Checks

### Endpoint Health Checks
The bridge service exposes `/health` returning details of external connections:
```json
{
  "status": "UP",
  "timestamp": "2026-06-04T16:02:00Z",
  "components": {
    "db": { "status": "UP", "path": "node:sqlite" },
    "sorobanRpc": { "status": "UP", "url": "https://soroban-testnet.stellar.org" },
    "ninepay": { "status": "UP", "balance": "15,200,000 VND" }
  }
}
```
- Configure AWS Route 53 or ECS Target Group to poll `/health` every 10 seconds.
