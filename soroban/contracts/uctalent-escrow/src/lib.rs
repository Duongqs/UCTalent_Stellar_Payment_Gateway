#![no_std]

mod types;
mod factory;
mod escrow;

pub use crate::types::{
    EscrowConfig, ReferralConfig, ReferralStatus,
    MilestoneConfig, MilestoneStatus, Milestone, WithdrawalRecord, DataKey,
};

use soroban_sdk::{contract, contractimpl, Address, BytesN, Env};

/// UCTalent Escrow Contract
/// This contract manages dual-rail payouts for UCTalent gig work and referrals.
/// It uses a factory pattern to initialize independent escrows for tracking 
/// different milestones and disputes separately.
#[contract]
pub struct UCTalentContract;

#[contractimpl]
impl UCTalentContract {
    // ── Factory ──────────────────────────────────────────────────────────────

    pub fn factory_init(env: Env, wasm_hash: BytesN<32>) {
        factory::factory_init(&env, wasm_hash);
    }

    /// Legacy: maps to create_referral_escrow for backward-compat
    pub fn create_escrow(env: Env, config: EscrowConfig) -> Address {
        let ref_config = ReferralConfig {
            client: config.client,
            candidate: config.developer,
            platform_address: config.platform_address,
            anchor_address: config.anchor_address,
            token: config.token,
            bounty_amount: config.bounty_amount,
            scout_rate: config.scout_rate,
            platform_rate: config.platform_rate,
            dispute_window_secs: 14 * 24 * 3600,
            expiry_ledger: config.expiry_ledger,
            job_id: soroban_sdk::String::from_str(&env, "legacy"),
        };
        factory::create_referral_escrow(&env, ref_config)
    }

    pub fn create_referral_escrow(env: Env, config: ReferralConfig) -> Address {
        factory::create_referral_escrow(&env, config)
    }

    pub fn create_milestone_escrow(env: Env, config: MilestoneConfig) -> Address {
        factory::create_milestone_escrow(&env, config)
    }

    pub fn create_and_fund_referral_escrow(env: Env, config: ReferralConfig) -> Address {
        factory::create_and_fund_referral_escrow(&env, config)
    }

    pub fn create_and_fund_milestone_escrow(env: Env, config: MilestoneConfig) -> Address {
        factory::create_and_fund_milestone_escrow(&env, config)
    }

    // ── Child Escrow Init ─────────────────────────────────────────────────────

    /// Called by factory cross-contract invoke after deploy
    pub fn escrow_init(env: Env, config: EscrowConfig) {
        let ref_config = ReferralConfig {
            client: config.client,
            candidate: config.developer,
            platform_address: config.platform_address,
            anchor_address: config.anchor_address,
            token: config.token,
            bounty_amount: config.bounty_amount,
            scout_rate: config.scout_rate,
            platform_rate: config.platform_rate,
            dispute_window_secs: 14 * 24 * 3600,
            expiry_ledger: config.expiry_ledger,
            job_id: soroban_sdk::String::from_str(&env, "legacy"),
        };
        escrow::referral_init(&env, ref_config);
    }

    pub fn referral_init(env: Env, config: ReferralConfig) {
        escrow::referral_init(&env, config);
    }

    pub fn milestone_init(env: Env, config: MilestoneConfig) {
        escrow::milestone_init(&env, config);
    }

    // ── Actions ───────────────────────────────────────────────────────────────

    pub fn deposit(env: Env, client: Address) {
        escrow::deposit(&env, client);
    }

    /// Referral bounty release
    pub fn release_bounty(env: Env, client: Address, has_scout: bool, scout_kyc_id: BytesN<32>) {
        escrow::release_bounty(&env, client, has_scout, scout_kyc_id);
    }

    /// Milestone release (legacy — kept for backward compat; prefer complete_milestone + withdraw_to_anchor)
    pub fn release_milestone(env: Env, client: Address, index: u32) {
        escrow::release_milestone(&env, client, index);
    }

    /// Mark milestone as completed (state change only, no funds moved)
    pub fn complete_milestone(env: Env, client: Address, index: u32) {
        escrow::complete_milestone(&env, client, index);
    }

    /// Release platform fee to platform_wallet (called when candidate is hired)
    pub fn release_platform_fee(env: Env, platform: Address) {
        escrow::release_platform_fee(&env, platform);
    }

    /// Assign freelancer KYC ID to the escrow
    pub fn assign_freelancer(env: Env, kyc_id: BytesN<32>) {
        escrow::assign_freelancer(&env, kyc_id);
    }

    /// Freelancer (via platform) withdraws completed milestone funds to anchor
    pub fn withdraw_to_anchor(env: Env, platform: Address, index: u32) {
        escrow::withdraw_to_anchor(&env, platform, index);
    }

    /// Record withdrawal audit metadata on-chain after 9Pay confirms disbursement
    pub fn record_withdrawal_metadata(env: Env, platform: Address, index: u32, record: WithdrawalRecord) {
        escrow::record_withdrawal_metadata(&env, platform, index, record);
    }

    /// Client or Freelancer opens a dispute, freezing the milestone funds
    pub fn dispute_milestone(env: Env, initiator: Address, index: u32) {
        escrow::dispute_milestone(&env, initiator, index);
    }

    pub fn dispute_referral(env: Env, initiator: Address) {
        escrow::dispute_referral(&env, initiator);
    }



    pub fn refund(env: Env) {
        escrow::refund(&env);
    }

    pub fn cancel_remaining(env: Env) {
        escrow::cancel_remaining(&env);
    }

    // ── Queries ───────────────────────────────────────────────────────────────

    pub fn get_status(env: Env) -> ReferralStatus {
        escrow::get_status(&env)
    }

    pub fn get_milestone_status(env: Env) -> MilestoneStatus {
        escrow::get_milestone_status(&env)
    }

    // ── Admin ─────────────────────────────────────────────────────────────────

    pub fn admin_resolve_dispute(env: Env, admin: Address, index: u32, client_pct: u32, developer_pct: u32) {
        escrow::admin_resolve_dispute(&env, admin, index, client_pct, developer_pct);
    }

    pub fn admin_resolve_referral_dispute(env: Env, admin: Address, client_pct: u32, scout_pct: u32) {
        escrow::admin_resolve_referral_dispute(&env, admin, client_pct, scout_pct);
    }



    pub fn update_milestone_amount(env: Env, client: Address, index: u32, new_amount: i128) {
        escrow::update_milestone_amount(&env, client, index, new_amount);
    }
}

#[cfg(test)]
mod test;
