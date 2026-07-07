---
phase: testing
title: Testing Strategy
description: Define testing approach, test cases, and quality assurance
---

# Testing Strategy

## Test Coverage Goals
**What level of testing do we aim for?**

- Unit test coverage target (default: 100% of new/changed code)
- Integration test scope (critical paths + error handling)
- End-to-end test scenarios (key user journeys)
- Alignment with requirements/design acceptance criteria

## Unit Tests
**What individual components need testing?**

### Disbursement Bridge (Backend)
- [x] Test case 1: Oracle Exchange Rate API correctly fetches rates from `open.er-api.com` or `CoinGecko`.
- [x] Test case 2: `GET /api/exchange-rate` endpoint exposes the valid positive rate, source metadata, and timestamp.
- [ ] Additional coverage: Idempotency signature validation in `/api/anchor/disburse`.

### UCTalent Escrow UI (Frontend)
- [ ] Test case 1: UI successfully consumes `/api/exchange-rate` and calculates VND splits.
- [ ] Test case 2: UI toggle for "Path Payment" successfully appends `pathPaymentStrictReceive` operation into the Soroban Builder.

## Integration Tests
**How do we test component interactions?**

- [x] Integration scenario 1: Verify the Anchor API handles dynamic rates over time. (Validated via `src/oracle.test.js`)
- [ ] Integration scenario 2: Soroban Deposit with Path Payment executes atomically on the testnet.
- [x] API endpoint tests: `GET /api/exchange-rate` responds correctly.
- [ ] Integration scenario 3 (failure mode / rollback): Mock NAPAS Gateway responds with failure, Escrow retains state.

## End-to-End Tests
**What user flows need validation?**

- [ ] User flow 1: [Description]
- [ ] User flow 2: [Description]
- [ ] Critical path testing
- [ ] Regression of adjacent features

## Test Data
**What data do we use for testing?**

- Test fixtures and mocks
- Seed data requirements
- Test database setup

## Test Reporting & Coverage
**How do we verify and communicate test results?**

- Coverage commands and thresholds (`npm run test -- --coverage`)
- Coverage gaps (files/functions below 100% and rationale)
- Links to test reports or dashboards
- Manual testing outcomes and sign-off

## Manual Testing
**What requires human validation?**

- UI/UX testing checklist (include accessibility)
- Browser/device compatibility
- Smoke tests after deployment

## Performance Testing
**How do we validate performance?**

- Load testing scenarios
- Stress testing approach
- Performance benchmarks

## Bug Tracking
**How do we manage issues?**

- Issue tracking process
- Bug severity levels
- Regression testing strategy

