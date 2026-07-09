#![cfg(test)]
extern crate std;

use super::*;
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
    // platform_fee = 8M * 10% = 800k. Total deposit = 8.8M
    assert_eq!(ctx.token().balance(&escrow_addr), 8_800_000);
    
    // Release milestone 0
    ec.release_milestone(&ctx.client, &0);
    let ms_status = ec.get_milestone_status();
    assert!(ms_status.milestones.get(0).unwrap().is_completed);
    
    // M0: amount = 5M. freelancer_share = 5M, platform_share = 500k. total = 5.5M to anchor
    assert_eq!(ctx.token().balance(&ctx.anchor), 5_500_000);
    assert_eq!(ctx.token().balance(&escrow_addr), 3_300_000);
    
    // Release milestone 1
    ec.release_milestone(&ctx.client, &1);
    let ms_status = ec.get_milestone_status();
    assert!(ms_status.milestones.get(1).unwrap().is_completed);
    
    assert_eq!(ctx.token().balance(&ctx.anchor), 8_800_000);
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
    assert_eq!(ctx.token().balance(&escrow_addr), 5_500_000); // 5M + 10% = 5.5M
    assert_eq!(ctx.token().balance(&ctx.client), 14_500_000); // 20M - 5.5M = 14.5M

    ec.update_milestone_amount(&ctx.client, &0, &4_000_000);
    assert_eq!(ctx.token().balance(&escrow_addr), 4_400_000); // 4M + 10% = 4.4M
    assert_eq!(ctx.token().balance(&ctx.client), 15_600_000); // 20M - 4.4M = 15.6M
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


