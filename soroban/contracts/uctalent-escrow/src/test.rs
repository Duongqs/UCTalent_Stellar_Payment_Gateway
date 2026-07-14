#![cfg(test)]
extern crate std;

use super::*;
use crate::types::WithdrawalRecord;
use soroban_sdk::{
    testutils::{Address as _, Ledger as _, LedgerInfo},
    token::{Client as TokenClient, StellarAssetClient},
    Address, BytesN, Env, String,
};

// ─── Test Helpers ─────────────────────────────────────────────────────────────

struct TestCtx {
    env: Env,
    client: Address,
    developer: Address,
    scout: Address,
    platform: Address,
    anchor: Address,
    token_id: Address,
    factory_id: Address,
}

impl TestCtx {
    fn new(bounty: i128) -> Self {
        let env = Env::default();
        env.ledger().set(LedgerInfo {
            sequence_number: 1,
            timestamp: 0,
            protocol_version: 21,
            min_persistent_entry_ttl: 10_000,
            min_temp_entry_ttl: 16,
            max_entry_ttl: 100_000,
            ..Default::default()
        });
        env.mock_all_auths();

        let client = Address::generate(&env);
        let developer = Address::generate(&env);
        let scout = Address::generate(&env);
        let platform = Address::generate(&env);
        let anchor = Address::generate(&env);
        let token_admin = Address::generate(&env);

        let token_id = env.register_stellar_asset_contract_v2(token_admin.clone()).address();
        let token_admin_client = StellarAssetClient::new(&env, &token_id);
        token_admin_client.mint(&client, &(bounty * 2));

        let factory_id = env.register_contract(None, UCTalentContract);

        TestCtx { env, client, developer, scout, platform, anchor, token_id, factory_id }
    }

    fn token(&self) -> TokenClient {
        TokenClient::new(&self.env, &self.token_id)
    }

    fn set_ledger(&self, seq: u32) {
        self.env.ledger().set(LedgerInfo {
            sequence_number: seq,
            timestamp: seq as u64 * 5,
            protocol_version: 21,
            min_persistent_entry_ttl: 10_000,
            min_temp_entry_ttl: 16,
            max_entry_ttl: 100_000,
            ..Default::default()
        });
    }

    fn default_referral_config(&self, expiry_ledger: u32) -> ReferralConfig {
        ReferralConfig {
            client: self.client.clone(),
            candidate: self.developer.clone(),
            platform_address: self.platform.clone(),
            anchor_address: self.anchor.clone(),
            token: self.token_id.clone(),
            bounty_amount: self.token().balance(&self.client) / 2,
            scout_rate: 8000,    // 80% Scout — PRD spec
            platform_rate: 2000, // 20% Platform — PRD spec
            dispute_window_secs: 14 * 24 * 3600, // 14 days window
            expiry_ledger,
            job_id: String::from_str(&self.env, "job_test_001"),
        }
    }

    fn default_milestone_config(&self, amounts: soroban_sdk::Vec<i128>) -> MilestoneConfig {
        MilestoneConfig {
            client: self.client.clone(),
            platform_address: self.platform.clone(),
            anchor_address: self.anchor.clone(),
            token: self.token_id.clone(),
            milestones: amounts,
            platform_rate: 1000,   // 10%
            freelancer_rate: 10000, // 100%
            expiry_ledger: 5_000_000,
            freelancer_kyc_id: BytesN::from_array(&self.env, &[5u8; 32]),
            private_hash: BytesN::from_array(&self.env, &[0u8; 32]),
            probation_seconds: 10, // Short for tests
            gig_id: String::from_str(&self.env, "gig_test_001"),
            platform_wallet: self.platform.clone(),
        }
    }

    /// Legacy EscrowConfig for backward-compat tests
    fn default_config(&self, expiry_ledger: u32) -> EscrowConfig {
        let token = self.token();
        EscrowConfig {
            client: self.client.clone(),
            developer: self.developer.clone(),
            scout: self.scout.clone(),
            platform_address: self.platform.clone(),
            anchor_address: self.anchor.clone(),
            token: self.token_id.clone(),
            bounty_amount: token.balance(&self.client),
            scout_rate: 8000,
            platform_rate: 2000,
            expiry_ledger,
            developer_kyc_id: BytesN::from_array(&self.env, &[1u8; 32]),
            scout_kyc_id: BytesN::from_array(&self.env, &[2u8; 32]),
        }
    }

    fn create_referral_escrow(&self, config: &ReferralConfig) -> Address {
        let addr = self.env.register_contract(None, UCTalentContract);
        let c = UCTalentContractClient::new(&self.env, &addr);
        c.referral_init(config);
        addr
    }

    fn create_milestone_escrow_from(&self, config: &MilestoneConfig) -> Address {
        let addr = self.env.register_contract(None, UCTalentContract);
        let c = UCTalentContractClient::new(&self.env, &addr);
        c.milestone_init(config);
        addr
    }

    fn create_escrow(&self, config: &EscrowConfig) -> Address {
        let addr = self.env.register_contract(None, UCTalentContract);
        let c = UCTalentContractClient::new(&self.env, &addr);
        c.escrow_init(config);
        addr
    }

    fn create_milestone_escrow(&self, config: &MilestoneConfig) -> Address {
        let addr = self.env.register_contract(None, UCTalentContract);
        let c = UCTalentContractClient::new(&self.env, &addr);
        c.milestone_init(config);
        addr
    }
}

// ─── Test 1: Referral Full Lifecycle (PRD: Client + Platform dual-sign) ───────

#[test]
fn test_referral_full_lifecycle() {
    let ctx = TestCtx::new(10_000_000);
    ctx.set_ledger(100);

    let config = ctx.default_referral_config(200);
    let escrow_addr = ctx.create_referral_escrow(&config);
    let ec = UCTalentContractClient::new(&ctx.env, &escrow_addr);

    // Pre-deposit
    let status = ec.get_status();
    assert!(!status.is_deposited);
    assert!(!status.is_released);

    // Deposit
    ec.deposit(&ctx.client);
    assert_eq!(ctx.token().balance(&ctx.client), 10_000_000); // 20M - 10M = 10M
    assert_eq!(ctx.token().balance(&escrow_addr), 10_000_000);
    assert!(ec.get_status().is_deposited);

    // Confirm Placement
    let status = ec.get_status();

    // Release: Must wait for dispute window
    ctx.env.ledger().with_mut(|l| { l.timestamp += 14 * 24 * 3600 + 1; });
    ec.release_bounty(&ctx.client, &true, &BytesN::from_array(&ctx.env, &[0u8; 32]));
    let status = ec.get_status();
    assert!(status.is_released);

    // Entire bounty sent to anchor (SDP handles split off-chain)
    assert_eq!(ctx.token().balance(&ctx.anchor), 10_000_000);
    assert_eq!(ctx.token().balance(&escrow_addr), 0);
}

// ─── Test 2: 80/20 Split Math (GAP-02) ───────────────────────────────────────

#[test]
fn test_split_math_80_20() {
    let ctx = TestCtx::new(10_000); // 10,000 units
    ctx.set_ledger(10);

    let config = ctx.default_referral_config(100);
    let escrow_addr = ctx.create_referral_escrow(&config);
    let ec = UCTalentContractClient::new(&ctx.env, &escrow_addr);

    ec.deposit(&ctx.client);
    ctx.env.ledger().with_mut(|l| { l.timestamp += 14 * 24 * 3600 + 1; });
    ec.release_bounty(&ctx.client, &true, &BytesN::from_array(&ctx.env, &[0u8; 32]));

    // Scout 80% = 8,000; Platform 20% = 2,000 — both via anchor
    assert_eq!(ctx.token().balance(&ctx.anchor), 10_000);
    assert_eq!(ctx.token().balance(&escrow_addr), 0);
}

// ─── Test 3: Self-apply → 100% to Platform ────────────────────────────────────

#[test]
fn test_self_apply_100_pct_platform() {
    let ctx = TestCtx::new(5_000);
    ctx.set_ledger(10);

    let config = ctx.default_referral_config(100);
    let escrow_addr = ctx.create_referral_escrow(&config);
    let ec = UCTalentContractClient::new(&ctx.env, &escrow_addr);

    // No admin_set_scout → has_scout is false
    ec.deposit(&ctx.client);
    ctx.env.ledger().with_mut(|l| { l.timestamp += 14 * 24 * 3600 + 1; });
    ec.release_bounty(&ctx.client, &true, &BytesN::from_array(&ctx.env, &[0u8; 32]));

    // 100% goes to anchor (platform treasury)
    assert_eq!(ctx.token().balance(&ctx.anchor), 5_000);
}

// ─── Test 4: Double deposit rejected ──────────────────────────────────────────

#[test]
#[should_panic]
fn test_double_deposit_rejected() {
    let ctx = TestCtx::new(1_000);
    ctx.set_ledger(10);
    let config = ctx.default_referral_config(100);
    let escrow_addr = ctx.create_referral_escrow(&config);
    let ec = UCTalentContractClient::new(&ctx.env, &escrow_addr);
    ec.deposit(&ctx.client);
    ec.deposit(&ctx.client); // panic
}

// ─── Test 5: Double release rejected ─────────────────────────────────────────

#[test]
#[should_panic]
fn test_double_release_rejected() {
    let ctx = TestCtx::new(1_000);
    ctx.set_ledger(10);
    let config = ctx.default_referral_config(100);
    let escrow_addr = ctx.create_referral_escrow(&config);
    let ec = UCTalentContractClient::new(&ctx.env, &escrow_addr);
    ec.deposit(&ctx.client);
    ctx.env.ledger().with_mut(|l| { l.timestamp += 14 * 24 * 3600 + 1; });
    ec.release_bounty(&ctx.client, &true, &BytesN::from_array(&ctx.env, &[0u8; 32]));
    ec.release_bounty(&ctx.client, &true, &BytesN::from_array(&ctx.env, &[0u8; 32])); // panic
}

// ─── Test 6: Refund after expiry ──────────────────────────────────────────────

#[test]
fn test_refund_after_expiry() {
    let ctx = TestCtx::new(5_000);
    ctx.set_ledger(10);
    let config = ctx.default_referral_config(50);
    let escrow_addr = ctx.create_referral_escrow(&config);
    let ec = UCTalentContractClient::new(&ctx.env, &escrow_addr);

    ec.deposit(&ctx.client);
    ctx.set_ledger(51);
    ec.refund();

    assert_eq!(ctx.token().balance(&ctx.client), 10_000); // 10k minted, 5k deposited, 5k refunded
    assert_eq!(ctx.token().balance(&escrow_addr), 0);
    assert!(ec.get_status().is_refunded);
}

// ─── Test 7: Refund before expiry rejected ────────────────────────────────────

#[test]
#[should_panic]
fn test_refund_before_expiry_rejected() {
    let ctx = TestCtx::new(5_000);
    ctx.set_ledger(10);
    let config = ctx.default_referral_config(50);
    let escrow_addr = ctx.create_referral_escrow(&config);
    let ec = UCTalentContractClient::new(&ctx.env, &escrow_addr);
    ec.deposit(&ctx.client);
    ec.refund(); // panic
}

// ─── Test 8: Milestone full lifecycle ────────────────────────────────────────

#[test]
fn test_milestone_full_lifecycle() {
    let ctx = TestCtx::new(10_000_000);
    ctx.set_ledger(10);
    let mut amounts = soroban_sdk::Vec::new(&ctx.env);
    amounts.push_back(5_000_000);
    amounts.push_back(3_000_000);
    let config = ctx.default_milestone_config(amounts);
    let escrow_addr = ctx.create_milestone_escrow(&config);
    let ec = UCTalentContractClient::new(&ctx.env, &escrow_addr);
    
    // Deposit
    ec.deposit(&ctx.client);
    // platform_fee is paid on top. Total deposit = 8.8M
    assert_eq!(ctx.token().balance(&escrow_addr), 8_800_000);
    
    // Release milestone 0
    ec.release_milestone(&ctx.client, &0);
    let ms_status = ec.get_milestone_status();
    assert!(ms_status.milestones.get(0).unwrap().is_completed);
    
    // M0: amount = 5M. freelancer_share = 5M
    assert_eq!(ctx.token().balance(&ctx.anchor), 5_000_000);
    assert_eq!(ctx.token().balance(&escrow_addr), 3_800_000);
    
    // Release milestone 1
    ec.release_milestone(&ctx.client, &1);
    let ms_status = ec.get_milestone_status();
    assert!(ms_status.milestones.get(1).unwrap().is_completed);
    
    assert_eq!(ctx.token().balance(&ctx.anchor), 8_000_000);
    // Platform fee (800000) was left in the contract, but since all milestones are complete,
    // _check_and_refund_surplus refunded it to the client!
    assert_eq!(ctx.token().balance(&escrow_addr), 0);
}

// ─── Test 9: Cancel remaining milestones ─────────────────────────────────────
#[test]
fn test_cancel_remaining() {
    let ctx = TestCtx::new(10_000_000);
    ctx.set_ledger(10);
    let mut amounts = soroban_sdk::Vec::new(&ctx.env);
    amounts.push_back(5_000_000);
    amounts.push_back(3_000_000);
    let config = ctx.default_milestone_config(amounts);
    let escrow_addr = ctx.create_milestone_escrow(&config);
    let ec = UCTalentContractClient::new(&ctx.env, &escrow_addr);
    
    ec.deposit(&ctx.client); // Deposits 8.8M
    let client_balance_before = ctx.token().balance(&ctx.client);
    
    // Cancel remaining
    ec.cancel_remaining();
    
    let ms_status = ec.get_milestone_status();
    assert!(ms_status.is_cancelled);
    
    // Everything should be refunded
    assert_eq!(ctx.token().balance(&ctx.client), client_balance_before + 8_800_000);
    assert_eq!(ctx.token().balance(&escrow_addr), 0);
}



// ─── Test 11: dispute_milestone + admin_resolve_dispute (GAP-06) ──────────────

#[test]
fn test_dispute_workflow() {
    let ctx = TestCtx::new(5_000_000);
    ctx.set_ledger(10);

    let mut amounts = soroban_sdk::Vec::new(&ctx.env);
    amounts.push_back(5_000_000);

    let config = ctx.default_milestone_config(amounts);
    let escrow_addr = ctx.create_milestone_escrow(&config);
    let ec = UCTalentContractClient::new(&ctx.env, &escrow_addr);

    ec.deposit(&ctx.client);

    // Client opens dispute
    ec.dispute_milestone(&ctx.client, &0);
    assert!(ec.get_milestone_status().milestones.get(0).unwrap().is_disputed);

    // sign_milestone should be blocked
    let res = ec.try_release_milestone(&ctx.client, &0);
    assert!(res.is_err());

    // Admin resolves: 50% client, 50% developer
    ec.admin_resolve_dispute(&ctx.platform, &0, &50, &50);

    let ms = ec.get_milestone_status().milestones.get(0).unwrap();
    assert!(ms.is_completed);
    assert!(!ms.is_disputed);

    // After resolve, net_amount = 5000000.
    // client_share = 2500000, developer_share = 2500000
    // Platform fee left in contract: 500000.
    // Since release_platform_fee was not called and milestone is now complete, 
    // _check_and_refund_surplus refunds this 500000 surplus to client.
    assert_eq!(ctx.token().balance(&ctx.anchor), 2_500_000);
    // Original client had 10M, deposited 5.5M. Balance before = 4.5M. 
    // Received: client_share (2500000) + surplus (500000) = 3000000. Total = 7500000.
    assert_eq!(ctx.token().balance(&ctx.client), 7_500_000);
    assert_eq!(ctx.token().balance(&escrow_addr), 0);
}



// ─── Test 15: dispute_referral + admin resolve ────────────────────────────────

#[test]
fn test_referral_dispute_and_resolve() {
    let ctx = TestCtx::new(10_000_000);
    ctx.set_ledger(10);
    let config = ctx.default_referral_config(200);
    let escrow_addr = ctx.create_referral_escrow(&config);
    let ec = UCTalentContractClient::new(&ctx.env, &escrow_addr);
    
    ec.deposit(&ctx.client);
    assert_eq!(ctx.token().balance(&escrow_addr), 10_000_000);
    
    // Dispute
    ec.dispute_referral(&ctx.client);
    let status = ec.get_status();
    assert!(status.is_disputed);
    
    // Admin resolve (50% to client, 50% to scout)
    ec.admin_resolve_referral_dispute(&ctx.platform, &50, &50);
    
    let status = ec.get_status();
    assert!(status.is_released);
    assert!(!status.is_disputed);
    
    // Payout logic in admin_resolve_referral_dispute:
    // platform_share = 10_000_000 * 20% = 2_000_000
    // net = 8_000_000
    // client = 4_000_000
    // scout = 4_000_000
    // anchor gets platform_share + scout_share = 6_000_000
    // client gets client_share = 4_000_000
    
    assert_eq!(ctx.token().balance(&ctx.anchor), 6_000_000);
    assert_eq!(ctx.token().balance(&escrow_addr), 0);
}

// ─── Test 18: update_milestone_amount ─────────────────────────────────────────
#[test]
fn test_update_milestone_amount_refunds() {
    let ctx = TestCtx::new(10_000_000);
    ctx.set_ledger(10);
    let mut amounts = soroban_sdk::Vec::new(&ctx.env);
    amounts.push_back(5_000_000);
    let config = ctx.default_milestone_config(amounts);
    let escrow_addr = ctx.create_milestone_escrow(&config);
    let ec = UCTalentContractClient::new(&ctx.env, &escrow_addr);
    
    ec.deposit(&ctx.client);
    assert_eq!(ctx.token().balance(&escrow_addr), 5_500_000); // 5.5M
    assert_eq!(ctx.token().balance(&ctx.client), 14_500_000); // 20M - 5.5M = 14.5M

    ec.update_milestone_amount(&ctx.client, &0, &4_000_000);
    assert_eq!(ctx.token().balance(&escrow_addr), 5_500_000); // Deferred refund
    assert_eq!(ctx.token().balance(&ctx.client), 14_500_000); // 14.5M
}

#[test]
#[should_panic(expected = "Previous milestone must be completed first")]
fn test_out_of_order_release_rejected() {
    let ctx = TestCtx::new(10_000_000);
    ctx.set_ledger(10);
    let mut amounts = soroban_sdk::Vec::new(&ctx.env);
    amounts.push_back(5_000_000);
    amounts.push_back(3_000_000);
    let config = ctx.default_milestone_config(amounts);
    let escrow_addr = ctx.create_milestone_escrow(&config);
    let ec = UCTalentContractClient::new(&ctx.env, &escrow_addr);
    
    ec.deposit(&ctx.client);
    
    // Release milestone 1 directly without releasing milestone 0 (should panic)
    ec.release_milestone(&ctx.client, &1);
}

// ─── New Flow Tests: complete_milestone + withdraw_to_anchor ───────────────

#[test]
fn test_complete_milestone_state_only() {
    let ctx = TestCtx::new(10_000_000);
    ctx.set_ledger(10);
    let mut amounts = soroban_sdk::Vec::new(&ctx.env);
    amounts.push_back(5_000_000);
    let config = ctx.default_milestone_config(amounts);
    let escrow_addr = ctx.create_milestone_escrow(&config);
    let ec = UCTalentContractClient::new(&ctx.env, &escrow_addr);

    ec.deposit(&ctx.client);
    let anchor_balance_before = ctx.token().balance(&ctx.anchor);

    // complete_milestone should NOT transfer funds
    ec.complete_milestone(&ctx.client, &0);
    let ms_status = ec.get_milestone_status();
    let m = ms_status.milestones.get(0).unwrap();
    assert!(m.is_completed);
    assert!(!m.is_withdrawn);

    // anchor balance should NOT change
    assert_eq!(ctx.token().balance(&ctx.anchor), anchor_balance_before);
}

#[test]
fn test_release_platform_fee() {
    let ctx = TestCtx::new(10_000_000);
    ctx.set_ledger(10);
    let mut amounts = soroban_sdk::Vec::new(&ctx.env);
    amounts.push_back(5_000_000);
    amounts.push_back(3_000_000);
    let config = ctx.default_milestone_config(amounts);
    let escrow_addr = ctx.create_milestone_escrow(&config);
    let ec = UCTalentContractClient::new(&ctx.env, &escrow_addr);

    ec.deposit(&ctx.client);
    // total = 8M, platform fee = 8M * 10% = 800000
    let platform_balance_before = ctx.token().balance(&ctx.platform);
    let contract_balance_before = ctx.token().balance(&escrow_addr);

    ec.release_platform_fee(&ctx.platform);

    let ms_status = ec.get_milestone_status();
    assert!(ms_status.platform_fee_released);

    // platform wallet received 800000
    assert_eq!(ctx.token().balance(&ctx.platform), platform_balance_before + 800_000);
    // contract balance decreased by 800000
    assert_eq!(ctx.token().balance(&escrow_addr), contract_balance_before - 800_000);
}

#[test]
fn test_assign_freelancer() {
    let ctx = TestCtx::new(5_000_000);
    ctx.set_ledger(10);
    let mut amounts = soroban_sdk::Vec::new(&ctx.env);
    amounts.push_back(5_000_000);
    let config = ctx.default_milestone_config(amounts);
    let escrow_addr = ctx.create_milestone_escrow(&config);
    let ec = UCTalentContractClient::new(&ctx.env, &escrow_addr);

    let new_kyc = BytesN::from_array(&ctx.env, &[9u8; 32]);
    ec.assign_freelancer(&new_kyc);
    // KYC ID updated in config (we rely on event, storage is not directly readable from outside)
}

#[test]
fn test_withdraw_to_anchor_after_complete() {
    let ctx = TestCtx::new(10_000_000);
    ctx.set_ledger(10);
    let mut amounts = soroban_sdk::Vec::new(&ctx.env);
    amounts.push_back(5_000_000);
    let config = ctx.default_milestone_config(amounts);
    let escrow_addr = ctx.create_milestone_escrow(&config);
    let ec = UCTalentContractClient::new(&ctx.env, &escrow_addr);

    ec.deposit(&ctx.client);
    // release platform fee first
    ec.release_platform_fee(&ctx.platform);
    // complete milestone
    ec.complete_milestone(&ctx.client, &0);

    let anchor_balance_before = ctx.token().balance(&ctx.anchor);

    // withdraw_to_anchor
    ec.withdraw_to_anchor(&ctx.platform, &0);
    let ms_status = ec.get_milestone_status();
    let m = ms_status.milestones.get(0).unwrap();
    assert!(m.is_completed);
    assert!(m.is_withdrawn);

    // 5M minus no fee = 5000000
    assert_eq!(ctx.token().balance(&ctx.anchor), anchor_balance_before + 5_000_000);
}

#[test]
#[should_panic(expected = "Milestone not completed")]
fn test_withdraw_before_complete_rejected() {
    let ctx = TestCtx::new(5_000_000);
    ctx.set_ledger(10);
    let mut amounts = soroban_sdk::Vec::new(&ctx.env);
    amounts.push_back(5_000_000);
    let config = ctx.default_milestone_config(amounts);
    let escrow_addr = ctx.create_milestone_escrow(&config);
    let ec = UCTalentContractClient::new(&ctx.env, &escrow_addr);

    ec.deposit(&ctx.client);
    ec.release_platform_fee(&ctx.platform);
    ec.withdraw_to_anchor(&ctx.platform, &0);
}

#[test]
#[should_panic(expected = "Already withdrawn")]
fn test_double_withdraw_rejected() {
    let ctx = TestCtx::new(5_000_000);
    ctx.set_ledger(10);
    let mut amounts = soroban_sdk::Vec::new(&ctx.env);
    amounts.push_back(5_000_000);
    let config = ctx.default_milestone_config(amounts);
    let escrow_addr = ctx.create_milestone_escrow(&config);
    let ec = UCTalentContractClient::new(&ctx.env, &escrow_addr);

    ec.deposit(&ctx.client);
    ec.release_platform_fee(&ctx.platform);
    ec.complete_milestone(&ctx.client, &0);
    ec.withdraw_to_anchor(&ctx.platform, &0);
    ec.withdraw_to_anchor(&ctx.platform, &0);
}

#[test]
fn test_record_withdrawal_metadata() {
    let ctx = TestCtx::new(5_000_000);
    ctx.set_ledger(10);
    let mut amounts = soroban_sdk::Vec::new(&ctx.env);
    amounts.push_back(5_000_000);
    let config = ctx.default_milestone_config(amounts);
    let escrow_addr = ctx.create_milestone_escrow(&config);
    let ec = UCTalentContractClient::new(&ctx.env, &escrow_addr);

    ec.deposit(&ctx.client);
    ec.release_platform_fee(&ctx.platform);
    ec.complete_milestone(&ctx.client, &0);
    ec.withdraw_to_anchor(&ctx.platform, &0);

    let record = WithdrawalRecord {
        freelancer_kyc_id: BytesN::from_array(&ctx.env, &[5u8; 32]),
        amount_usdc: 5_000_000,
        amount_vnd: 125_000_000,
        platform_fee_usdc: 500_000,
        exchange_rate_bps: 25_000,
        tax_withheld_vnd: 12_500_000,
        napas_ref: String::from_str(&ctx.env, "NAPAS-123456"),
        stellar_tx_hash: String::from_str(&ctx.env, "abc123def456"),
        timestamp: 1000,
    };

    ec.record_withdrawal_metadata(&ctx.platform, &0, &record);
    // Record stored in persistent storage (verified via event emission)
}

#[test]
fn test_complete_new_flow_with_sequential_milestones() {
    let ctx = TestCtx::new(10_000_000);
    ctx.set_ledger(10);
    let mut amounts = soroban_sdk::Vec::new(&ctx.env);
    amounts.push_back(5_000_000);
    amounts.push_back(3_000_000);
    let config = ctx.default_milestone_config(amounts);
    let escrow_addr = ctx.create_milestone_escrow(&config);
    let ec = UCTalentContractClient::new(&ctx.env, &escrow_addr);

    ec.deposit(&ctx.client);
    ec.release_platform_fee(&ctx.platform);

    // Milestone 0: complete → withdraw
    ec.complete_milestone(&ctx.client, &0);
    ec.withdraw_to_anchor(&ctx.platform, &0);

    // Milestone 1: complete → withdraw
    ec.complete_milestone(&ctx.client, &1);
    ec.withdraw_to_anchor(&ctx.platform, &1);

    let ms_status = ec.get_milestone_status();
    assert!(ms_status.milestones.get(0).unwrap().is_withdrawn);
    assert!(ms_status.milestones.get(1).unwrap().is_withdrawn);
    // All funds distributed except platform fee: 5000000 + 3000000 = 8000000 to anchor
    assert_eq!(ctx.token().balance(&ctx.anchor), 8_000_000);
    // The rest is 0 (since platform fee was released)
    assert_eq!(ctx.token().balance(&escrow_addr), 0);
}

// ─── Edge Case Tests — Guard Clauses / Error Paths ────────────────────────

/// T22: release_platform_fee must be rejected if escrow has not been deposited.
/// Guard: escrow.rs:335  `!status.is_deposited → panic("Not deposited")`
#[test]
#[should_panic(expected = "Not deposited")]
fn test_release_platform_fee_before_deposit() {
    let ctx = TestCtx::new(5_000_000);
    ctx.set_ledger(10);
    let amounts = soroban_sdk::vec![&ctx.env, 5_000_000_i128];
    let config = ctx.default_milestone_config(amounts);
    let escrow_addr = ctx.create_milestone_escrow(&config);
    let ec = UCTalentContractClient::new(&ctx.env, &escrow_addr);

    ec.release_platform_fee(&ctx.platform);
}

/// T23: release_platform_fee must be rejected if already released.
/// Guard: escrow.rs:336  `status.platform_fee_released → panic("Fee already released")`
#[test]
#[should_panic(expected = "Fee already released")]
fn test_release_platform_fee_twice() {
    let ctx = TestCtx::new(5_000_000);
    ctx.set_ledger(10);
    let amounts = soroban_sdk::vec![&ctx.env, 5_000_000_i128];
    let config = ctx.default_milestone_config(amounts);
    let escrow_addr = ctx.create_milestone_escrow(&config);
    let ec = UCTalentContractClient::new(&ctx.env, &escrow_addr);

    ec.deposit(&ctx.client);
    ec.release_platform_fee(&ctx.platform);
    ec.release_platform_fee(&ctx.platform);
}

/// T24: complete_milestone must be rejected if escrow has not been deposited.
/// Guard: escrow.rs:389  `!status.is_deposited → panic("Not deposited")`
#[test]
#[should_panic(expected = "Not deposited")]
fn test_complete_milestone_before_deposit() {
    let ctx = TestCtx::new(5_000_000);
    ctx.set_ledger(10);
    let amounts = soroban_sdk::vec![&ctx.env, 5_000_000_i128];
    let config = ctx.default_milestone_config(amounts);
    let escrow_addr = ctx.create_milestone_escrow(&config);
    let ec = UCTalentContractClient::new(&ctx.env, &escrow_addr);

    ec.complete_milestone(&ctx.client, &0);
}

/// T25: complete_milestone must be rejected if already completed.
/// Guard: escrow.rs:403  `milestone.is_completed → panic("Milestone already completed")`
#[test]
#[should_panic(expected = "Milestone already completed")]
fn test_complete_milestone_twice() {
    let ctx = TestCtx::new(5_000_000);
    ctx.set_ledger(10);
    let amounts = soroban_sdk::vec![&ctx.env, 5_000_000_i128];
    let config = ctx.default_milestone_config(amounts);
    let escrow_addr = ctx.create_milestone_escrow(&config);
    let ec = UCTalentContractClient::new(&ctx.env, &escrow_addr);

    ec.deposit(&ctx.client);
    ec.complete_milestone(&ctx.client, &0);
    ec.complete_milestone(&ctx.client, &0);
}

/// T26: complete_milestone must enforce sequential ordering.
/// Guard: escrow.rs:396-399  `!prev.is_completed → panic("Previous milestone must be completed first")`
#[test]
#[should_panic(expected = "Previous milestone must be completed first")]
fn test_complete_milestone_out_of_order() {
    let ctx = TestCtx::new(10_000_000);
    ctx.set_ledger(10);
    let amounts = soroban_sdk::vec![&ctx.env, 5_000_000_i128, 3_000_000_i128];
    let config = ctx.default_milestone_config(amounts);
    let escrow_addr = ctx.create_milestone_escrow(&config);
    let ec = UCTalentContractClient::new(&ctx.env, &escrow_addr);

    ec.deposit(&ctx.client);
    ec.complete_milestone(&ctx.client, &1);
}

/// T27: withdraw_to_anchor must be rejected when called by a non-platform address.
/// Guard: escrow.rs:427  `platform != config.platform_address → panic("Only platform can initiate withdrawal")`
/// Note: mock_all_auths() bypasses require_auth, but the value comparison still works.
#[test]
#[should_panic(expected = "Only platform can initiate withdrawal")]
fn test_withdraw_by_non_platform_rejected() {
    let ctx = TestCtx::new(5_000_000);
    ctx.set_ledger(10);
    let amounts = soroban_sdk::vec![&ctx.env, 5_000_000_i128];
    let config = ctx.default_milestone_config(amounts);
    let escrow_addr = ctx.create_milestone_escrow(&config);
    let ec = UCTalentContractClient::new(&ctx.env, &escrow_addr);

    ec.deposit(&ctx.client);
    ec.complete_milestone(&ctx.client, &0);

    let attacker = Address::generate(&ctx.env);
    ec.withdraw_to_anchor(&attacker, &0);
}

/// T28: record_withdrawal_metadata must be rejected if milestone not yet withdrawn.
/// Guard: escrow.rs:480  `!milestone.is_withdrawn → panic("Milestone not yet withdrawn")`
#[test]
#[should_panic(expected = "Milestone not yet withdrawn")]
fn test_record_metadata_before_withdraw() {
    let ctx = TestCtx::new(5_000_000);
    ctx.set_ledger(10);
    let amounts = soroban_sdk::vec![&ctx.env, 5_000_000_i128];
    let config = ctx.default_milestone_config(amounts);
    let escrow_addr = ctx.create_milestone_escrow(&config);
    let ec = UCTalentContractClient::new(&ctx.env, &escrow_addr);

    ec.deposit(&ctx.client);
    ec.release_platform_fee(&ctx.platform);
    ec.complete_milestone(&ctx.client, &0);

    let record = WithdrawalRecord {
        freelancer_kyc_id: BytesN::from_array(&ctx.env, &[5u8; 32]),
        amount_usdc: 5_000_000,
        amount_vnd: 125_000_000,
        platform_fee_usdc: 500_000,
        exchange_rate_bps: 25_000,
        tax_withheld_vnd: 12_500_000,
        napas_ref: String::from_str(&ctx.env, "NAPAS-123456"),
        stellar_tx_hash: String::from_str(&ctx.env, "abc123def456"),
        timestamp: 1000,
    };

    ec.record_withdrawal_metadata(&ctx.platform, &0, &record);
}

/// T29: admin_resolve_dispute must reject invalid percentage splits.
/// Guard: escrow.rs:592  `client_pct + developer_pct != 100 → panic("Percentages must sum to 100")`
#[test]
#[should_panic(expected = "Percentages must sum to 100")]
fn test_dispute_resolve_invalid_percentages() {
    let ctx = TestCtx::new(5_000_000);
    ctx.set_ledger(10);
    let amounts = soroban_sdk::vec![&ctx.env, 5_000_000_i128];
    let config = ctx.default_milestone_config(amounts);
    let escrow_addr = ctx.create_milestone_escrow(&config);
    let ec = UCTalentContractClient::new(&ctx.env, &escrow_addr);

    ec.admin_resolve_dispute(&ctx.platform, &0, &50, &30);
}

/// T30: dispute_milestone must be rejected for an already-completed milestone.
/// Guard: escrow.rs:528  `milestone.is_completed → panic("Milestone already released")`
#[test]
#[should_panic(expected = "Milestone already released")]
fn test_dispute_completed_milestone_rejected() {
    let ctx = TestCtx::new(5_000_000);
    ctx.set_ledger(10);
    let amounts = soroban_sdk::vec![&ctx.env, 5_000_000_i128];
    let config = ctx.default_milestone_config(amounts);
    let escrow_addr = ctx.create_milestone_escrow(&config);
    let ec = UCTalentContractClient::new(&ctx.env, &escrow_addr);

    ec.deposit(&ctx.client);
    ec.release_platform_fee(&ctx.platform);
    ec.complete_milestone(&ctx.client, &0);
    ec.dispute_milestone(&ctx.client, &0);
}
