use crate::types::{
    DataKey, Milestone, MilestoneConfig, MilestoneStatus, ReferralConfig, ReferralStatus,
    WithdrawalRecord,
};
use soroban_sdk::{
    token::Client as TokenClient, Address, BytesN, Env, Map, Symbol, Vec,
};

const INACTIVITY_TIMEOUT_SECS: u64 = 14 * 24 * 60 * 60; // 14 days

// ─── Referral Escrow ──────────────────────────────────────────────────────────

/// Initializes the escrow state for a referral job.
/// This is typically called by the factory contract immediately after deploying this instance.
pub fn referral_init(env: &Env, config: ReferralConfig) {
    if env.storage().instance().has(&DataKey::Config) {
        panic!("Already initialized");
    }
    if config.scout_rate + config.platform_rate != 10_000 {
        panic!("scout_rate + platform_rate must equal 10000 bps");
    }
    if config.bounty_amount <= 0 {
        panic!("Bounty amount must be > 0");
    }
    env.storage().instance().set(&DataKey::Config, &config);
    let status = ReferralStatus {
        is_deposited: false,
        is_disputed: false,
        is_released: false,
        is_refunded: false,
        deposit_timestamp: 0,
    };
    env.storage().instance().set(&DataKey::Status, &status);
}

/// Allows the client to deposit the total bounty for the escrow.
/// Depending on the type of escrow (Referral or Milestone), it calculates the required total
/// and pulls funds from the client's address to the contract.
pub fn deposit(env: &Env, client: Address) {
    client.require_auth();

    if env.storage().instance().has(&DataKey::Config) {
        let config: ReferralConfig = env.storage().instance().get(&DataKey::Config).unwrap();
        let mut status: ReferralStatus = env.storage().instance().get(&DataKey::Status).unwrap();
        if client != config.client { panic!("Only client can deposit"); }
        if status.is_deposited { panic!("Already deposited"); }
        if status.is_released { panic!("Already released"); }
        if status.is_refunded { panic!("Already refunded"); }
        if env.ledger().sequence() > config.expiry_ledger { panic!("Contract expired"); }

        let token = TokenClient::new(env, &config.token);
        token.transfer(&client, &env.current_contract_address(), &config.bounty_amount);
        status.is_deposited = true;
        status.deposit_timestamp = env.ledger().timestamp();
        env.storage().instance().set(&DataKey::Status, &status);

    } else if env.storage().instance().has(&DataKey::MilestoneConfig) {
        let config: MilestoneConfig = env.storage().instance().get(&DataKey::MilestoneConfig).unwrap();
        let mut status: MilestoneStatus = env.storage().instance().get(&DataKey::MilestoneStatus).unwrap();
        if client != config.client { panic!("Only client can deposit"); }
        if status.is_deposited { panic!("Already deposited"); }
        if status.is_cancelled { panic!("Already cancelled"); }
        if env.ledger().sequence() > config.expiry_ledger { panic!("Contract expired"); }

        let mut total: i128 = 0;
        for amount in config.milestones.iter() { total += amount; }

        // Client pays the platform fee on top of the milestone budgets
        let platform_fee = (total * config.platform_rate as i128) / 10_000;
        let deposit_total = total + platform_fee;

        let token = TokenClient::new(env, &config.token);
        token.transfer(&client, &env.current_contract_address(), &deposit_total);
        status.is_deposited = true;
        env.storage().instance().set(&DataKey::MilestoneStatus, &status);
    } else {
        panic!("Escrow not initialized");
    }
}

/// Releases the bounty for a referral job.
/// Requires BOTH client and platform signatures.
pub fn release_bounty(env: &Env, client: Address, has_scout: bool, scout_kyc_id: BytesN<32>) {
    client.require_auth();

    if !env.storage().instance().has(&DataKey::Config) {
        panic!("Not a referral escrow");
    }
    let config: ReferralConfig = env.storage().instance().get(&DataKey::Config).unwrap();
    let mut status: ReferralStatus = env.storage().instance().get(&DataKey::Status).unwrap();

    if client != config.client {
        panic!("Only client can initiate release");
    }
    config.platform_address.require_auth(); // Ed25519 co-sign

    if !status.is_deposited { panic!("Not deposited"); }
    if status.is_disputed { panic!("Escrow is disputed"); }
    if status.is_released { panic!("Already released"); }
    if status.is_refunded { panic!("Already refunded"); }

    if env.ledger().timestamp() < status.deposit_timestamp + config.dispute_window_secs {
        panic!("Dispute window not elapsed");
    }

    status.is_released = true;
    env.storage().instance().set(&DataKey::Status, &status);

    let bounty = config.bounty_amount;

    let mut scout_share = (bounty * config.scout_rate as i128) / 10_000;
    let mut platform_share = (bounty * config.platform_rate as i128) / 10_000;

    if !has_scout {
        platform_share = bounty;
        scout_share = 0;
    }

    let token = TokenClient::new(env, &config.token);
    if bounty > 0 {
        token.transfer(&env.current_contract_address(), &config.anchor_address, &bounty);
    }

    // Emit event with job_id and recipient_address for SDP mapping
    env.events().publish(
        (
            Symbol::new(env, "uctalent"),
            Symbol::new(env, "referral_settled"),
            env.current_contract_address(),
        ),
        (
            config.job_id.clone(),
            config.anchor_address.clone(),
            bounty,
            scout_share,
            platform_share,
            scout_kyc_id,
        ),
    );
}

/// Allows the client to recall the deposit after the escrow expiration ledger has passed.
/// Can only be called if the bounty hasn't been released.
pub fn refund(env: &Env) {
    if !env.storage().instance().has(&DataKey::Config) { panic!("Not a referral escrow"); }
    let config: ReferralConfig = env.storage().instance().get(&DataKey::Config).unwrap();
    let mut status: ReferralStatus = env.storage().instance().get(&DataKey::Status).unwrap();

    config.client.require_auth();
    if !status.is_deposited { panic!("Not deposited"); }
    if status.is_released { panic!("Already released"); }
    if status.is_refunded { panic!("Already refunded"); }
    if env.ledger().sequence() <= config.expiry_ledger { panic!("Not yet expired"); }

    status.is_refunded = true;
    env.storage().instance().set(&DataKey::Status, &status);

    let token = TokenClient::new(env, &config.token);
    token.transfer(&env.current_contract_address(), &config.client, &config.bounty_amount);

    env.events().publish(
        (Symbol::new(env, "uctalent"), Symbol::new(env, "refund"), env.current_contract_address()),
        config.bounty_amount,
    );
}

/// Opens a dispute during the referral dispute window.
/// Can be initiated by either the client or the scout to freeze the escrow funds.
pub fn dispute_referral(env: &Env, initiator: Address) {
    initiator.require_auth();
    if !env.storage().instance().has(&DataKey::Config) { panic!("Not a referral escrow"); }
    let config: ReferralConfig = env.storage().instance().get(&DataKey::Config).unwrap();
    let mut status: ReferralStatus = env.storage().instance().get(&DataKey::Status).unwrap();

    let is_client = initiator == config.client;
    let is_platform = initiator == config.platform_address;
    if !is_client && !is_platform {
        panic!("Only client or platform can dispute");
    }

    if !status.is_deposited { panic!("Not deposited"); }
    if status.is_disputed { panic!("Already disputed"); }
    if status.is_released { panic!("Already released"); }

    status.is_disputed = true;
    env.storage().instance().set(&DataKey::Status, &status);

    env.events().publish(
        (Symbol::new(env, "uctalent"), Symbol::new(env, "referral_disputed"), env.current_contract_address()),
        (config.job_id.clone(), initiator),
    );
}

/// Resolves an open dispute in a referral escrow.
/// The platform admin specifies the split percentages between the client and scout.
pub fn admin_resolve_referral_dispute(env: &Env, admin: Address, client_pct: u32, scout_pct: u32) {
    admin.require_auth();
    if client_pct + scout_pct != 100 { panic!("Percentages must sum to 100"); }
    if !env.storage().instance().has(&DataKey::Config) { panic!("Not a referral escrow"); }
    
    let config: ReferralConfig = env.storage().instance().get(&DataKey::Config).unwrap();
    let mut status: ReferralStatus = env.storage().instance().get(&DataKey::Status).unwrap();

    if admin != config.platform_address { panic!("Only platform admin can resolve disputes"); }
    if !status.is_disputed { panic!("Not disputed"); }
    if status.is_released { panic!("Already released"); }

    status.is_released = true;
    status.is_disputed = false;
    env.storage().instance().set(&DataKey::Status, &status);

    let bounty = config.bounty_amount;
    let platform_share = (bounty * config.platform_rate as i128) / 10_000;
    let net_amount = bounty - platform_share;
    let client_share = (net_amount * client_pct as i128) / 100;
    let scout_share = net_amount - client_share;

    let token = TokenClient::new(env, &config.token);
    if platform_share + scout_share > 0 {
        token.transfer(&env.current_contract_address(), &config.anchor_address, &(platform_share + scout_share));
    }
    if client_share > 0 {
        token.transfer(&env.current_contract_address(), &config.client, &client_share);
    }

    env.events().publish(
        (Symbol::new(env, "uctalent"), Symbol::new(env, "referral_dispute_resolved"), env.current_contract_address()),
        (config.job_id.clone(), bounty, scout_share, platform_share),
    );
}

// ─── Milestone Escrow ─────────────────────────────────────────────────────────

/// Initializes the escrow state for a milestone-based freelance job.
/// Typical invocation is done by the factory immediately after deploying the contract.
pub fn milestone_init(env: &Env, config: MilestoneConfig) {
    if env.storage().instance().has(&DataKey::MilestoneConfig) {
        panic!("Already initialized");
    }
    if config.freelancer_rate > 10_000 {
        panic!("Freelancer rate cannot exceed 100%");
    }
    if config.milestones.is_empty() {
        panic!("Milestones list cannot be empty");
    }

    env.storage().instance().set(&DataKey::MilestoneConfig, &config);

    let len = config.milestones.len();
    let mut milestones = Vec::new(env);


    for i in 0..len {
        let amount = config.milestones.get(i).unwrap();
        milestones.push_back(Milestone {
            milestone_id: i,
            amount,
            is_completed: false,
            is_disputed: false,
            is_withdrawn: false,
        });
    }

    let status = MilestoneStatus {
        is_deposited: false,
        milestones,
        is_cancelled: false,
        platform_fee_released: false,
    };
    env.storage().instance().set(&DataKey::MilestoneStatus, &status);
}

/// Releases a milestone. Requires BOTH client and platform signatures.
pub fn release_milestone(env: &Env, client: Address, index: u32) {
    client.require_auth();

    if !env.storage().instance().has(&DataKey::MilestoneConfig) {
        panic!("Not a milestone escrow");
    }
    let config: MilestoneConfig = env.storage().instance().get(&DataKey::MilestoneConfig).unwrap();

    let mut status: MilestoneStatus = env.storage().instance().get(&DataKey::MilestoneStatus).unwrap();

    if client != config.client { panic!("Only client can initiate release"); }
    config.platform_address.require_auth();

    if !status.is_deposited { panic!("Not deposited"); }
    if status.is_cancelled { panic!("Already cancelled"); }

    let idx = index as usize;
    if idx >= config.milestones.len() as usize { panic!("Invalid milestone index"); }

    // Enforce sequential release: previous milestone must be completed
    if idx > 0 {
        let prev_milestone = status.milestones.get((index - 1) as u32).unwrap();
        if !prev_milestone.is_completed {
            panic!("Previous milestone must be completed first");
        }
    }

    let mut milestone = status.milestones.get(index).unwrap();
    if milestone.is_completed { panic!("Milestone already released"); }
    if milestone.is_disputed { panic!("Milestone is disputed"); }

    milestone.is_completed = true;
    milestone.is_withdrawn = true;
    status.milestones.set(index, milestone.clone());
    let zero_kyc = BytesN::from_array(env, &[0; 32]);
    if config.freelancer_kyc_id == zero_kyc {
        panic!("Freelancer KYC not assigned");
    }

    env.storage().instance().set(&DataKey::MilestoneStatus, &status);

    let milestone_amount = milestone.amount;

    let token = TokenClient::new(env, &config.token);
    if milestone_amount > 0 {
        token.transfer(&env.current_contract_address(), &config.anchor_address, &milestone_amount);
    }

    env.events().publish(
        (Symbol::new(env, "uctalent"), Symbol::new(env, "milestone_released"), env.current_contract_address()),
        (config.gig_id.clone(), index, milestone_amount, config.freelancer_kyc_id.clone()),
    );

    _check_and_refund_surplus(env, &config, &status);
}

/// Releases the platform fee to the platform wallet address.
/// Called by the backend when a candidate is hired for the gig.
pub fn release_platform_fee(env: &Env, platform: Address) {
    platform.require_auth();

    if !env.storage().instance().has(&DataKey::MilestoneConfig) {
        panic!("Not a milestone escrow");
    }
    let config: MilestoneConfig = env.storage().instance().get(&DataKey::MilestoneConfig).unwrap();
    let mut status: MilestoneStatus = env.storage().instance().get(&DataKey::MilestoneStatus).unwrap();

    if platform != config.platform_address { panic!("Only platform can release fee"); }
    if !status.is_deposited { panic!("Not deposited"); }
    if status.platform_fee_released { panic!("Fee already released"); }
    if status.is_cancelled { panic!("Already cancelled"); }

    status.platform_fee_released = true;
    env.storage().instance().set(&DataKey::MilestoneStatus, &status);

    let mut total: i128 = 0;
    for amount in config.milestones.iter() { total += amount; }
    let platform_fee = (total * config.platform_rate as i128) / 10_000;

    let token = TokenClient::new(env, &config.token);
    token.transfer(&env.current_contract_address(), &config.platform_wallet, &platform_fee);

    env.events().publish(
        (Symbol::new(env, "uctalent"), Symbol::new(env, "platform_fee_released"), env.current_contract_address()),
        (config.gig_id.clone(), platform_fee, config.platform_wallet.clone()),
    );
}

/// Assigns the freelancer's KYC ID to the escrow after hiring.
/// Called by the backend when a candidate is moved to hired status.
pub fn assign_freelancer(env: &Env, kyc_id: BytesN<32>) {
    if !env.storage().instance().has(&DataKey::MilestoneConfig) {
        panic!("Not a milestone escrow");
    }
    let mut config: MilestoneConfig = env.storage().instance().get(&DataKey::MilestoneConfig).unwrap();
    config.platform_address.require_auth();

    config.freelancer_kyc_id = kyc_id;
    env.storage().instance().set(&DataKey::MilestoneConfig, &config);

    env.events().publish(
        (Symbol::new(env, "uctalent"), Symbol::new(env, "freelancer_assigned"), env.current_contract_address()),
        (config.gig_id.clone(), config.freelancer_kyc_id.clone()),
    );
}

/// Marks a milestone as completed without transferring funds.
/// Requires BOTH client and platform signatures.
/// Funds remain in the smart contract until the freelancer withdraws.
pub fn complete_milestone(env: &Env, client: Address, index: u32) {
    client.require_auth();

    if !env.storage().instance().has(&DataKey::MilestoneConfig) {
        panic!("Not a milestone escrow");
    }
    let config: MilestoneConfig = env.storage().instance().get(&DataKey::MilestoneConfig).unwrap();

    let mut status: MilestoneStatus = env.storage().instance().get(&DataKey::MilestoneStatus).unwrap();

    if client != config.client { panic!("Only client can initiate"); }
    config.platform_address.require_auth();

    if !status.is_deposited { panic!("Not deposited"); }
    if status.is_cancelled { panic!("Already cancelled"); }

    let idx = index as usize;
    if idx >= config.milestones.len() as usize { panic!("Invalid milestone index"); }

    if idx > 0 {
        let prev = status.milestones.get((index - 1) as u32).unwrap();
        if !prev.is_completed {
            panic!("Previous milestone must be completed first");
        }
    }

    let mut milestone = status.milestones.get(index).unwrap();
    if milestone.is_completed { panic!("Milestone already completed"); }
    if milestone.is_disputed { panic!("Milestone is disputed"); }

    milestone.is_completed = true;
    status.milestones.set(index, milestone.clone());
    env.storage().instance().set(&DataKey::MilestoneStatus, &status);

    env.events().publish(
        (Symbol::new(env, "uctalent"), Symbol::new(env, "milestone_completed"), env.current_contract_address()),
        (config.gig_id.clone(), index, milestone.amount, config.freelancer_kyc_id.clone()),
    );
}

/// Transfers the freelancer's share for a completed milestone to the anchor address.
/// Only the platform can call this (on behalf of the web2 freelancer).
pub fn withdraw_to_anchor(env: &Env, platform: Address, index: u32) {
    platform.require_auth();

    if !env.storage().instance().has(&DataKey::MilestoneConfig) {
        panic!("Not a milestone escrow");
    }
    let config: MilestoneConfig = env.storage().instance().get(&DataKey::MilestoneConfig).unwrap();
    let mut status: MilestoneStatus = env.storage().instance().get(&DataKey::MilestoneStatus).unwrap();

    if platform != config.platform_address { panic!("Only platform can initiate withdrawal"); }
    if !status.is_deposited { panic!("Not deposited"); }
    if status.is_cancelled { panic!("Already cancelled"); }

    let idx = index as usize;
    if idx >= config.milestones.len() as usize { panic!("Invalid milestone index"); }

    let mut milestone = status.milestones.get(index).unwrap();
    if !milestone.is_completed { panic!("Milestone not completed"); }
    if milestone.is_disputed { panic!("Milestone is disputed"); }
    if milestone.is_withdrawn { panic!("Already withdrawn"); }

    milestone.is_withdrawn = true;
    status.milestones.set(index, milestone.clone());
    let zero_kyc = BytesN::from_array(env, &[0; 32]);
    if config.freelancer_kyc_id == zero_kyc {
        panic!("Freelancer KYC not assigned");
    }

    env.storage().instance().set(&DataKey::MilestoneStatus, &status);

    let milestone_amount = milestone.amount;

    let token = TokenClient::new(env, &config.token);
    if milestone_amount > 0 {
        token.transfer(&env.current_contract_address(), &config.anchor_address, &milestone_amount);
    }

    env.events().publish(
        (Symbol::new(env, "uctalent"), Symbol::new(env, "funds_withdrawn"), env.current_contract_address()),
        (config.gig_id.clone(), index, milestone_amount, config.freelancer_kyc_id.clone()),
    );

    _check_and_refund_surplus(env, &config, &status);
}

/// Records withdrawal audit metadata on-chain after 9Pay confirms the disbursement.
/// Only the platform can call this. The record is stored in persistent storage.
pub fn record_withdrawal_metadata(
    env: &Env,
    platform: Address,
    index: u32,
    record: WithdrawalRecord,
) {
    platform.require_auth();

    if !env.storage().instance().has(&DataKey::MilestoneConfig) {
        panic!("Not a milestone escrow");
    }
    let config: MilestoneConfig = env.storage().instance().get(&DataKey::MilestoneConfig).unwrap();

    if platform != config.platform_address { panic!("Only platform can record metadata"); }

    let status: MilestoneStatus = env.storage().instance().get(&DataKey::MilestoneStatus).unwrap();
    let idx = index as usize;
    if idx >= config.milestones.len() as usize { panic!("Invalid milestone index"); }
    let milestone = status.milestones.get(index).unwrap();
    if !milestone.is_withdrawn { panic!("Milestone not yet withdrawn"); }

    let mut records: Map<u32, WithdrawalRecord> = env.storage()
        .persistent()
        .get(&DataKey::WithdrawalRecords)
        .unwrap_or(Map::new(env));
    records.set(index, record.clone());
    env.storage().persistent().set(&DataKey::WithdrawalRecords, &records);

    env.events().publish(
        (Symbol::new(env, "uctalent"), Symbol::new(env, "withdrawal_audited"), env.current_contract_address()),
        (
            config.gig_id.clone(),
            index,
            record.freelancer_kyc_id,
            record.amount_usdc,
            record.amount_vnd,
            record.platform_fee_usdc,
            record.exchange_rate_bps,
            record.tax_withheld_vnd,
            record.napas_ref,
            record.stellar_tx_hash,
            record.timestamp,
        ),
    );
}

/// Opens a dispute to freeze a specific milestone.
/// Initiated by either the client or the platform.
pub fn dispute_milestone(env: &Env, initiator: Address, index: u32) {
    initiator.require_auth();

    if !env.storage().instance().has(&DataKey::MilestoneConfig) {
        panic!("Not a milestone escrow");
    }
    let config: MilestoneConfig = env.storage().instance().get(&DataKey::MilestoneConfig).unwrap();
    let mut status: MilestoneStatus = env.storage().instance().get(&DataKey::MilestoneStatus).unwrap();

    if initiator != config.client && initiator != config.platform_address {
        panic!("Only client or platform can dispute");
    }
    if !status.is_deposited { panic!("Not deposited"); }
    if status.is_cancelled { panic!("Already cancelled"); }

    let idx = index as usize;
    if idx >= config.milestones.len() as usize { panic!("Invalid milestone index"); }

    let mut milestone = status.milestones.get(index).unwrap();
    if milestone.is_completed { panic!("Milestone already released"); }
    if milestone.is_disputed { panic!("Already disputed"); }

    milestone.is_disputed = true;
    status.milestones.set(index, milestone);
    env.storage().instance().set(&DataKey::MilestoneStatus, &status);

    env.events().publish(
        (Symbol::new(env, "uctalent"), Symbol::new(env, "milestone_disputed"), env.current_contract_address()),
        (config.gig_id.clone(), index, initiator),
    );
}

/// Cancels a milestone escrow and refunds any remaining unreleased balances.
/// The client can call this if they wish to terminate the gig prematurely.
pub fn cancel_remaining(env: &Env) {
    if !env.storage().instance().has(&DataKey::MilestoneConfig) { panic!("Not a milestone escrow"); }
    let config: MilestoneConfig = env.storage().instance().get(&DataKey::MilestoneConfig).unwrap();
    let mut status: MilestoneStatus = env.storage().instance().get(&DataKey::MilestoneStatus).unwrap();

    config.client.require_auth();
    config.platform_address.require_auth();
    
    if !status.is_deposited { panic!("Not deposited"); }
    if status.is_cancelled { panic!("Already cancelled"); }

    let mut unreleased: i128 = 0;
    for m in status.milestones.iter() {
        if m.is_disputed {
            panic!("Cannot cancel while a milestone is disputed");
        }
        if !m.is_completed { unreleased += m.amount; }
    }
    if unreleased <= 0 { panic!("All milestones already released"); }

    status.is_cancelled = true;
    env.storage().instance().set(&DataKey::MilestoneStatus, &status);

    let token = TokenClient::new(env, &config.token);
    let surplus = token.balance(&env.current_contract_address());
    if surplus > 0 {
        token.transfer(&env.current_contract_address(), &config.client, &surplus);
    }

    env.events().publish(
        (Symbol::new(env, "uctalent"), Symbol::new(env, "milestone_cancelled"), env.current_contract_address()),
        unreleased,
    );
}

pub fn get_status(env: &Env) -> ReferralStatus {
    env.storage().instance().get(&DataKey::Status).unwrap()
}

pub fn get_milestone_status(env: &Env) -> MilestoneStatus {
    env.storage().instance().get(&DataKey::MilestoneStatus).unwrap()
}

// ─── Shared / Admin ───────────────────────────────────────────────────────────

/// Resolves a milestone dispute by splitting the frozen funds between client and freelancer.
/// Only the platform admin can call this.
pub fn admin_resolve_dispute(env: &Env, admin: Address, index: u32, client_pct: u32, developer_pct: u32) {
    admin.require_auth();
    if client_pct + developer_pct != 100 { panic!("Percentages must sum to 100"); }
    if !env.storage().instance().has(&DataKey::MilestoneConfig) { panic!("Not a milestone escrow"); }

    let config: MilestoneConfig = env.storage().instance().get(&DataKey::MilestoneConfig).unwrap();
    let mut status: MilestoneStatus = env.storage().instance().get(&DataKey::MilestoneStatus).unwrap();

    if admin != config.platform_address { panic!("Only platform admin can resolve disputes"); }
    if !status.is_deposited { panic!("Not deposited"); }
    if status.is_cancelled { panic!("Already cancelled"); }

    let idx = index as usize;
    if idx >= config.milestones.len() as usize { panic!("Invalid milestone index"); }
    let mut milestone = status.milestones.get(index).unwrap();
    if milestone.is_completed { panic!("Already released"); }
    if milestone.is_withdrawn { panic!("Already withdrawn"); }
    if !milestone.is_disputed { panic!("Milestone is not disputed"); }

    milestone.is_completed = true;
    milestone.is_disputed = false;
    status.milestones.set(index, milestone.clone());
    env.storage().instance().set(&DataKey::MilestoneStatus, &status);

    let milestone_amount = milestone.amount;
    let client_share = (milestone_amount * client_pct as i128) / 100;
    let developer_share = milestone_amount - client_share;

    let token = TokenClient::new(env, &config.token);
    if developer_share > 0 {
        token.transfer(&env.current_contract_address(), &config.anchor_address, &developer_share);
    }
    if client_share > 0 {
        token.transfer(&env.current_contract_address(), &config.client, &client_share);
    }

    env.events().publish(
        (Symbol::new(env, "uctalent"), Symbol::new(env, "dispute_resolved"), env.current_contract_address()),
        (config.gig_id.clone(), index, milestone_amount, developer_share, 0i128),
    );

    _check_and_refund_surplus(env, &config, &status);
}

/// Allows the platform to set or update the scout responsible for the escrow.
/// Also updates the associated KYC ID for the scout.



/// Modifies the amount allocated to a specific milestone.
/// Clients can only reduce the amount. The excess tokens are kept in the contract
/// and will be refunded when all milestones are completed.
pub fn update_milestone_amount(env: &Env, client: Address, index: u32, new_amount: i128) {
    client.require_auth();
    if new_amount < 0 { panic!("Amount cannot be negative"); }
    if !env.storage().instance().has(&DataKey::MilestoneConfig) { panic!("Not a milestone escrow"); }

    let mut config: MilestoneConfig = env.storage().instance().get(&DataKey::MilestoneConfig).unwrap();
    let mut status: MilestoneStatus = env.storage().instance().get(&DataKey::MilestoneStatus).unwrap();

    if client != config.client { panic!("Only client can update milestone amount"); }
    if status.is_cancelled { panic!("Already cancelled"); }

    let idx = index as usize;
    if idx >= config.milestones.len() as usize { panic!("Invalid milestone index"); }

    let mut milestone = status.milestones.get(index).unwrap();
    if milestone.is_completed { panic!("Milestone already completed"); }

    let old_amount = milestone.amount;
    if new_amount > old_amount { panic!("Amount can only be decreased"); }

    milestone.amount = new_amount;
    status.milestones.set(index, milestone);
    config.milestones.set(index, new_amount);

    env.storage().instance().set(&DataKey::MilestoneConfig, &config);
    env.storage().instance().set(&DataKey::MilestoneStatus, &status);
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

fn _check_and_refund_surplus(env: &Env, config: &MilestoneConfig, status: &MilestoneStatus) {
    let mut all_done = true;
    for m in status.milestones.iter() {
        if !m.is_completed { all_done = false; break; }
    }
    if all_done {
        let token = TokenClient::new(env, &config.token);
        let surplus = token.balance(&env.current_contract_address());
        if surplus > 0 {
            token.transfer(&env.current_contract_address(), &config.client, &surplus);
            env.events().publish(
                (Symbol::new(env, "uctalent"), Symbol::new(env, "bounty_closed"), env.current_contract_address()),
                surplus,
            );
        }
    }
}
