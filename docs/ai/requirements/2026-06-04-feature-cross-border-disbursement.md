---
phase: requirements
title: Requirements & Problem Understanding — Cross-Border Disbursement Bridge
description: Production-grade Stellar Soroban escrow & 9Pay fiat settlement for UCTalent referral bounties and freelance milestone payments
feature: cross-border-disbursement
---

# Requirements & Problem Understanding

## Problem Statement

### Core Problem
UCTalent is a decentralized talent network (https://uctalent.io) that connects companies with high-tech professionals via a referral bounty model. Currently, the platform runs its referral payment system on **Ethereum/EVM chains** (contract: `UCTalentReferralPublicV2.sol`) using ERC-20 tokens. This works for crypto-native users, but creates significant friction for **cross-border fiat payouts** — particularly for referrers and freelancers based in Vietnam (the primary market) who need to receive payments in VND via local bank accounts (NAPAS network).

### Who is Affected?
| Actor | Pain Point |
|---|---|
| **Referrers (Headhunters)** | Earn bounties in ERC-20 tokens on EVM chains but need VND in their bank accounts. Must manually sell crypto on CEX → withdraw to bank — high fees, compliance risk, 2-3 day settlement |
| **Freelancers (New feature)** | Will earn milestone-based payments but face the same off-ramp friction |
| **Clients (Hiring Companies)** | Want to fund escrows from any crypto holding (XLM, USDC, etc.) — current EVM-only model limits funding options |
| **UCTalent Platform** | Needs a trustless, auditable settlement bridge to satisfy VIFC-DN regulatory requirements for cross-border payment transparency |

### Current Situation
- **On-chain**: `UCTalentReferralPublicV2.sol` on EVM (Base/COTI) handles job creation, escrow, dispute, and settlement — all in ERC-20 tokens
- **Off-ramp**: No automated fiat off-ramp exists. Referrers must self-service crypto-to-fiat conversion
- **Demo bridge**: A proof-of-concept exists at `/uc-cross-border` using Stellar Soroban (Factory-Child escrow pattern) + 9Pay sandbox integration, but it is **not production-ready** and has several architectural issues (polling-based listener with RPC filter limits, mixed classic+Soroban transaction failures, missing trustline validation)

---

## Goals & Objectives

### Primary Goals

1. **Build two production-grade Soroban Smart Contracts** on Stellar:
   - **Contract A: Referral Bounty Escrow** — Mirrors the existing `UCTalentReferralPublicV2.sol` logic but on Stellar, with automatic cross-border fiat settlement
   - **Contract B: Freelance Milestone Escrow** — New contract for milestone-based freelancer payments with multi-milestone release capability

2. **Implement an event-driven queue architecture** to replace the current polling-based listener:
   - UCTalent Backend (NestJS) receives webhook/event notifications from the Stellar bridge
   - Intermediate business logic (ATS pipeline steps, probation checks, etc.) runs in UCTalent's existing BullMQ queue system
   - Only after all conditions pass does the system trigger Vault B (9Pay) fiat settlement

3. **Integrate 9Pay Payment Gateway** for automated VND bank transfers:
   - Lock USDC in Vault A (on-chain Soroban escrow)
   - On release, trigger 9Pay API to transfer VND equivalent from pre-funded Vault B (merchant VND pool) to recipient's bank account via NAPAS

4. **Support dual-chain architecture**:
   - **Ethereum (EVM)**: Existing smart contract for on-chain hiring verification (`UCTalentReferralPublicV2.sol`)
   - **Stellar (Soroban)**: New contracts for cross-border payment settlement

### Secondary Goals
- Support Path Payment (XLM → USDC atomic swap) for clients who hold XLM instead of USDC
- Provide a real-time audit trail with 4-way traceability: Soroban TX → SEP-31 ID → NAPAS Clearing ID → Bank Reference
- Expose a webhook API from the cross-border bridge so UCTalent backend can subscribe to settlement status updates

### Non-Goals (Explicitly Out of Scope)
- Replacing the existing EVM-based `UCTalentReferralPublicV2.sol` — it continues to operate independently
- KYC/AML verification at the smart contract level — handled by UCTalent backend
- Supporting fiat currencies other than VND in Phase 1
- Multi-chain token bridging (e.g., Ethereum ↔ Stellar asset bridging)
- ~~Post-hire conditions (probation period, etc.)~~ — **Deferred**: currently only dual-signature (Client + Candidate) triggers release

---

## User Stories & Use Cases

### Contract A: Referral Bounty Flow

```
US-A1: As a Client (Hiring Company), I want to post a job with a bounty of $X USDC,
       so that the platform automatically locks 100% of my deposit into a Soroban escrow 
       (80% for referrer reward + 20% platform fee).

US-A2: As a Referrer, I want to see the net bounty amount (80% of deposit) displayed on 
       the UCTalent job board, so I know exactly what I will earn if my referral succeeds.

US-A3: As a Client, after my hiring process completes and both Client and Candidate sign 
       the consensus, I want the smart contract to automatically release the bounty to 
       the referrer's bank account in VND via 9Pay.

US-A4: As a Referrer based in Vietnam, I want to receive my bounty in VND directly to 
       my NAPAS bank account, without needing to manually convert crypto.

US-A5: As the UCTalent Platform, I want to automatically receive the 20% platform fee 
       in USDC to the platform treasury wallet upon job closure.
```

### Contract B: Freelance Milestone Flow

```
US-B1: As a Client, I want to create a freelance contract with N milestones, each with 
       a defined USDC amount, so that the total escrow is locked upfront in a Soroban 
       contract.

US-B2: As a Client, after a Freelancer completes milestone M, I want to sign approval 
       (dual-signature: Client + Freelancer) to release only that milestone's funds.

US-B3: As a Freelancer, I want each completed milestone's payment to be automatically 
       converted to VND and sent to my bank account via 9Pay.

US-B4: As a Client, if the freelance engagement is terminated early, I want the remaining 
       unreleased milestone funds refunded to my wallet.
```

### Cross-Border Bridge (Queue Architecture)

```
US-C1: As the UCTalent backend, I want to receive a webhook notification when a Soroban 
       escrow event (deposit, release, refund) occurs, so I can process intermediate 
       business logic before triggering fiat settlement.

US-C2: As a system operator, I want the event listener to reliably handle an unlimited 
       number of active escrow contracts without hitting Stellar RPC filter limits 
       (max 5 contract IDs per filter).

US-C3: As an auditor, I want every cross-border payment to produce an immutable 4-way 
       audit trail linking: Soroban TX Hash ↔ SEP-31 Reference ↔ NAPAS Clearing ID 
       ↔ Bank Reference Number.
```

### Key Workflows

#### Workflow 1: Referral Bounty Lifecycle
```
Client posts Job on uctalent.io (bounty: $1000 USDC)
  → Client signs Freighter TX to lock $1000 USDC into Soroban Contract A
  → Job appears on uctalent.io with "Bounty: $800" (80% net)
  → Referrer finds and refers Candidate
  → Candidate applies, interviews, gets hired
  → Client signs consensus ✓ + Candidate signs consensus ✓
  → [FUTURE: Probation/conditions check — currently skipped]
  → Smart Contract releases:
      • $800 USDC → Referrer (via 9Pay → VND bank transfer)
      • $200 USDC → Platform Treasury wallet
  → UCTalent backend receives webhook → updates job status → notifies referrer
```

#### Workflow 2: Freelance Milestone Lifecycle
```
Client creates Freelance Post with 3 milestones ($500, $300, $200 = $1000 total)
  → Client locks $1000 USDC into Soroban Contract B
  → Freelancer applies and gets accepted
  → Milestone 1 completed → dual-sign → release $500 → 9Pay → VND to freelancer
  → Milestone 2 completed → dual-sign → release $300 → 9Pay → VND to freelancer
  → Contract terminated → refund $200 to Client wallet
```

### Edge Cases
- Client has no USDC — use Path Payment (XLM → USDC) via Stellar DEX
- Recipient has no USDC trustline — auto-open trustline before transfer
- 9Pay VND pool (Vault B) has insufficient balance — queue payment and retry with alert
- Stellar RPC is temporarily unavailable — exponential backoff with dead-letter queue
- Oracle exchange rate stale (> 5 min old) — reject settlement, re-fetch rate
- Dual-signature timeout (one party never signs) — configurable expiry with auto-refund

---

## Success Criteria

| # | Criterion | Measurement |
|---|---|---|
| SC-1 | Referral bounty: end-to-end from escrow lock to VND bank credit completes within **5 minutes** | Timer from on-chain confirmation to 9Pay callback |
| SC-2 | Freelance milestone: partial release of individual milestones without affecting remaining escrow | Unit test + integration test |
| SC-3 | Event listener handles **100+ active contracts** without RPC errors | Load test with 100 concurrent child escrows |
| SC-4 | 9Pay settlement success rate ≥ **99%** (excluding insufficient Vault B balance) | Monitoring dashboard |
| SC-5 | Audit trail completeness: 100% of settlements have all 4 IDs populated | Database constraint + monitoring |
| SC-6 | Path Payment (XLM → USDC) swap completes atomically without manual intervention | E2E test |
| SC-7 | Platform fee (20%) is correctly split and transferred to treasury on every settlement | Smart contract unit test |

---

## Constraints & Assumptions

### Technical Constraints
- **Stellar RPC**: Maximum 5 contract IDs per event filter — requires chunking or queue-based architecture
- **Soroban**: Classic operations (path_payment) cannot be mixed with Soroban invocations in a single transaction for simulation purposes — requires sequential transaction splitting
- **9Pay API**: Production API requires IP whitelisting, HMAC-SHA256 authentication, and VND amounts as integers (no decimals)
- **Freighter Wallet**: Users must have USDC trustline established before receiving USDC transfers

### Business Constraints
- **Platform Fee Model**: Client deposits 100% → Platform takes 20% → Referrer/Freelancer receives 80% (matching existing `UCTalentReferralPublicV2.sol` where `platformBps = 2000` i.e. 20% of net, but reframed as 20% of gross deposit)
- **VND Only**: Phase 1 supports only VND fiat off-ramp via NAPAS (Vietnam domestic banking network)
- **Dual-Chain**: Ethereum contracts continue operating independently; Stellar contracts handle cross-border settlement only

### Assumptions
- UCTalent backend (NestJS) will integrate the cross-border bridge as an external microservice via REST webhook
- 9Pay merchant account will be pre-funded with sufficient VND liquidity
- Exchange rate oracle provides real-time USDC/VND rates (currently sourced from exchangerate-api.com)
- Stellar Testnet for development; Mainnet for production deployment

---

## Questions & Open Items

> **IMPORTANT**: The following items require stakeholder input before proceeding to Design phase.

| # | Question | Status |
|---|---|---|
| Q-1 | **Fee model confirmation**: Is the split exactly 80/20 (referrer/platform) for all job types, or can it be configured per-job? The existing EVM contract uses `platformBps=1000` (10% on top), but you mentioned 20% — please confirm exact model | 🟡 Needs clarification |
| Q-2 | **Candidate share**: The existing EVM contract gives candidates 20% of reward on referral success (`candidateBpsReferral=2000`). You said candidates don't receive anything in the new system — is this correct even when a referrer is involved? | ✅ Confirmed: Candidate receives nothing |
| Q-3 | **Dispute mechanism**: The EVM contract has a full dispute flow (7-day window, admin resolution). Should the Soroban contracts also implement this, or is dual-signature consensus sufficient for Phase 1? | 🟡 Needs decision |
| Q-4 | **Probation/condition triggers**: Currently deferred (just dual-sign). When re-enabled, will the trigger come from UCTalent backend (off-chain) calling the Soroban contract, or should the contract have time-lock logic? | ⏸️ Deferred |
| Q-5 | **Multi-headcount jobs**: EVM contract supports `totalHeadcount > 1` (multiple slots per job). Should Soroban Contract A also support multiple referrers per job, or 1:1 (one job → one referrer)? | 🟡 Needs clarification |
| Q-6 | **Freelance milestone contract**: Should this be a Factory-Child pattern (one contract per freelance engagement) or a single shared contract with job IDs (like the EVM contract)? | 🟡 Needs decision |
