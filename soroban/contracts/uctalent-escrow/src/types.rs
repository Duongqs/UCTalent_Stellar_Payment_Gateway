use soroban_sdk::{contracttype, Address, BytesN, String, Vec};

// ─────────────────────────────────────────────────────────────────────────────
// Legacy EscrowConfig (kept for backward-compat with existing tests)
// ─────────────────────────────────────────────────────────────────────────────
/// Legacy EscrowConfig (kept for backward-compat with existing tests)
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EscrowConfig {
    pub client: Address,
    pub developer: Address,
    pub scout: Address,
    pub platform_address: Address,
    pub anchor_address: Address,
    pub token: Address,
    pub bounty_amount: i128,
    pub scout_rate: u32,
    pub platform_rate: u32,
    pub expiry_ledger: u32,
    pub developer_kyc_id: BytesN<32>,
    pub scout_kyc_id: BytesN<32>,
}

// ─────────────────────────────────────────────────────────────────────────────
// Referral Escrow (Normal Jobs — 80% Scout / 20% Platform)
// PRD: "protected by Ed25519 signature checks from the platform backend key"
// ─────────────────────────────────────────────────────────────────────────────

/// Configuration for a standard referral-based job escrow.
/// Defines the participating parties, the payment tokens, and the reward distribution logic.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ReferralConfig {
    /// The client funding the escrow
    pub client: Address,
    /// The candidate being hired
    pub candidate: Address,
    /// The platform backend key responsible for co-signing actions (Ed25519)
    pub platform_address: Address,
    /// The anchor address representing the cross-border payment gateway
    pub anchor_address: Address,
    /// Token used for escrow (usually USDC)
    pub token: Address,
    /// Total bounty deposited by the client
    pub bounty_amount: i128,
    /// Scout's share in basis points (e.g., 8000 = 80%)
    pub scout_rate: u32,
    /// Platform's share in basis points (e.g., 2000 = 20%)
    pub platform_rate: u32,
    /// Duration in seconds for the mandatory dispute window after confirmation
    pub dispute_window_secs: u64,
    /// Ledger sequence after which the escrow expires and can be refunded
    pub expiry_ledger: u32,
    /// Backend tracking ID — used in events so SDP can map to DB record
    pub job_id: String,
}

/// Tracks the lifecycle state of a referral escrow.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ReferralStatus {
    /// True if the client has deposited the required bounty
    pub is_deposited: bool,
    /// True if a dispute has been opened by either party
    pub is_disputed: bool,
    /// True if funds have been released to the anchor/scout
    pub is_released: bool,
    /// True if funds were refunded to the client after expiry
    pub is_refunded: bool,
}

// ─────────────────────────────────────────────────────────────────────────────
// Milestone (Freelance Gig)
// ─────────────────────────────────────────────────────────────────────────────
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
    pub struct Milestone {
    pub milestone_id: u32,
    pub amount: i128,
    pub is_completed: bool,
    pub is_disputed: bool,
    pub is_withdrawn: bool,
}

// ─────────────────────────────────────────────────────────────────────────────
// Milestone Escrow Config (Freelance Jobs)
// ─────────────────────────────────────────────────────────────────────────────
/// Configuration for a milestone-based freelance job escrow.
/// Defines multiple payouts corresponding to project milestones and safety buffers.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MilestoneConfig {
    /// The client funding the milestones
    pub client: Address,
    /// The platform's admin address for co-signing
    pub platform_address: Address,
    /// The cross-border payment anchor address
    pub anchor_address: Address,
    /// Escrow token (usually USDC)
    pub token: Address,
    /// Array representing the payment amounts for each milestone
    pub milestones: Vec<i128>,
    /// Platform fee rate in basis points
    pub platform_rate: u32,
    /// Freelancer's share rate in basis points
    pub freelancer_rate: u32,
    /// Ledger limit after which unclaimed funds can be refunded
    pub expiry_ledger: u32,
    /// Freelancer's KYC verification ID
    pub freelancer_kyc_id: BytesN<32>,
    pub private_hash: BytesN<32>,
    /// Probation lock in seconds (production: 30 * 24 * 3600 = 2_592_000)
    pub probation_seconds: u64,
    /// Backend tracking ID — used in events so SDP can map to DB record
    pub gig_id: String,
    /// Wallet address that receives platform fee when hired
    pub platform_wallet: Address,
}

/// Tracks the state of a milestone-based freelance gig.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MilestoneStatus {
    /// True if the total fund (buffer + milestones) has been deposited
    pub is_deposited: bool,
    /// Array tracking individual milestones' lifecycle
    pub milestones: Vec<Milestone>,
    /// True if the gig was cancelled by the client
    pub is_cancelled: bool,
    /// True if the platform fee has been released to platform_wallet
    pub platform_fee_released: bool,
}

// ─────────────────────────────────────────────────────────────────────────────
// Withdrawal Audit Record
// ─────────────────────────────────────────────────────────────────────────────
/// Metadata stored on-chain after 9Pay confirms a disbursement.
/// Enables full audit trail reconciliation between on-chain and off-chain data.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct WithdrawalRecord {
    pub freelancer_kyc_id: BytesN<32>,
    pub amount_usdc: i128,
    pub amount_vnd: i128,
    pub platform_fee_usdc: i128,
    pub exchange_rate_bps: u64,
    pub tax_withheld_vnd: i128,
    pub napas_ref: String,
    pub stellar_tx_hash: String,
    pub timestamp: u64,
}

// ─────────────────────────────────────────────────────────────────────────────
// Storage Keys
// ─────────────────────────────────────────────────────────────────────────────
#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    // Factory Keys
    WasmHash,
    EscrowCounter,
    // Escrow Keys
    Config,
    Status,
    MilestoneConfig,
    MilestoneStatus,
    WithdrawalRecords,
}
