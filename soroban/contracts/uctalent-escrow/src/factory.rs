use crate::types::{DataKey, MilestoneConfig, ReferralConfig};
use soroban_sdk::{Address, BytesN, Env, IntoVal, String};

/// Initializes the Factory by storing the WebAssembly hash (Wasm Hash) of the escrow contract.
/// This must be called exactly once during the initial setup of the Factory Contract.
pub fn factory_init(env: &Env, wasm_hash: BytesN<32>) {
    if env.storage().instance().has(&DataKey::WasmHash) {
        panic!("Factory already initialized");
    }
    env.storage().instance().set(&DataKey::WasmHash, &wasm_hash);
    env.storage().instance().set(&DataKey::EscrowCounter, &0u64);
}

/// Allows a client to spawn a new Referral Escrow contract instance.
/// Emits an `escrow_created` event upon successful creation.
pub fn create_referral_escrow(env: &Env, config: ReferralConfig) -> Address {
    config.client.require_auth();

    let wasm_hash: BytesN<32> = env
        .storage()
        .instance()
        .get(&DataKey::WasmHash)
        .expect("Not a factory");

    let mut counter: u64 = env
        .storage()
        .instance()
        .get(&DataKey::EscrowCounter)
        .unwrap_or(0);
    counter += 1;
    env.storage()
        .instance()
        .set(&DataKey::EscrowCounter, &counter);

    // Create a unique salt string so the deployer does not have duplicate addresses
    let mut salt_bytes = [0u8; 32];
    let counter_bytes = counter.to_be_bytes();
    salt_bytes[24..32].copy_from_slice(&counter_bytes);
    let salt = BytesN::from_array(env, &salt_bytes);

    // Deploy the child contract using the factory's Wasm Hash and unique salt
    let child_address = env.deployer().with_current_contract(salt).deploy(wasm_hash);

    // Call the `referral_init` function on the newly deployed child contract to set up the configuration.
    let init_args = soroban_sdk::vec![env, config.into_val(env)];
    env.invoke_contract::<()>(
        &child_address,
        &soroban_sdk::Symbol::new(env, "referral_init"),
        init_args,
    );

    // Emit an event to notify off-chain systems (like the SDP listener) about the newly created escrow.
    env.events().publish(
        (
            String::from_str(env, "uctalent_factory"),
            String::from_str(env, "escrow_created"),
        ),
        child_address.clone(),
    );

    child_address
}

/// Allows a client to spawn a new Milestone Escrow contract instance.
/// Emits an `escrow_created` event upon successful creation.
pub fn create_milestone_escrow(env: &Env, config: MilestoneConfig) -> Address {
    config.client.require_auth();

    let wasm_hash: BytesN<32> = env
        .storage()
        .instance()
        .get(&DataKey::WasmHash)
        .expect("Not a factory");

    let mut counter: u64 = env
        .storage()
        .instance()
        .get(&DataKey::EscrowCounter)
        .unwrap_or(0);
    counter += 1;
    env.storage()
        .instance()
        .set(&DataKey::EscrowCounter, &counter);

    // Tạo chuỗi salt duy nhất để deployer không bị trùng lặp address
    let mut salt_bytes = [0u8; 32];
    let counter_bytes = counter.to_be_bytes();
    salt_bytes[24..32].copy_from_slice(&counter_bytes);
    let salt = BytesN::from_array(env, &salt_bytes);

    // Deploy the child contract using the factory's Wasm Hash and unique salt
    let child_address = env.deployer().with_current_contract(salt).deploy(wasm_hash);

    // Call the `milestone_init` function on the newly deployed child contract to set up the configuration.
    let init_args = soroban_sdk::vec![env, config.into_val(env)];
    env.invoke_contract::<()>(
        &child_address,
        &soroban_sdk::Symbol::new(env, "milestone_init"),
        init_args,
    );

    // Emit an event to notify off-chain systems (like the SDP listener) about the newly created escrow.
    env.events().publish(
        (
            String::from_str(env, "uctalent_factory"),
            String::from_str(env, "escrow_created"),
        ),
        child_address.clone(),
    );

    child_address
}

/// Helper function to calculate total milestone amount
fn sum_milestones(milestones: &soroban_sdk::Vec<i128>) -> i128 {
    let mut total: i128 = 0;
    for amount in milestones.iter() {
        total += amount;
    }
    total
}

/// Spawns a new Referral Escrow and immediately funds it in a single transaction.
/// This prevents escrows from being created without initial deposits.
pub fn create_and_fund_referral_escrow(env: &Env, config: ReferralConfig) -> Address {
    // Spawn the child contract
    let child_address = create_referral_escrow(env, config.clone());

    // Automatically invoke `deposit` on the child, pulling tokens from the client's wallet
    // and updating the escrow status to DEPOSITED.
    let deposit_args = soroban_sdk::vec![env, config.client.into_val(env)];
    env.invoke_contract::<()>(
        &child_address,
        &soroban_sdk::Symbol::new(env, "deposit"),
        deposit_args,
    );

    child_address
}

/// Spawns a new Milestone Escrow and immediately funds it in a single transaction.
/// This prevents escrows from being created without initial deposits.
pub fn create_and_fund_milestone_escrow(env: &Env, config: MilestoneConfig) -> Address {
    // Spawn the child contract
    let child_address = create_milestone_escrow(env, config.clone());

    // Automatically invoke `deposit` on the child, pulling tokens from the client's wallet
    // and updating the escrow status to DEPOSITED.
    let deposit_args = soroban_sdk::vec![env, config.client.into_val(env)];
    env.invoke_contract::<()>(
        &child_address,
        &soroban_sdk::Symbol::new(env, "deposit"),
        deposit_args,
    );

    child_address
}
