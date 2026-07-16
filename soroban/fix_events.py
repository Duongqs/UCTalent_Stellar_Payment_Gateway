import re

with open("contracts/uctalent-escrow/src/escrow.rs", "r") as f:
    content = f.read()

# Replace: env.events().publish(("error", Symbol::new(env, "not_milestone_escrow")));
# With: env.events().publish((Symbol::new(env, "error"), Symbol::new(env, "not_milestone_escrow")), ());

content = content.replace(
    'env.events().publish(("error", Symbol::new(env, "not_milestone_escrow")));',
    'env.events().publish((Symbol::new(env, "error"), Symbol::new(env, "not_milestone_escrow")), ());'
)

content = content.replace(
    'env.events().publish(("error", Symbol::new(env, "no_milestone_status")));',
    'env.events().publish((Symbol::new(env, "error"), Symbol::new(env, "no_milestone_status")), ());'
)

content = content.replace(
    'env.events().publish(("error", Symbol::new(env, "platform_mismatch"), platform, config.platform_address));',
    'env.events().publish((Symbol::new(env, "error"), Symbol::new(env, "platform_mismatch")), (platform.clone(), config.platform_address.clone()));'
)

content = content.replace(
    'env.events().publish(("error", Symbol::new(env, "not_deposited")));',
    'env.events().publish((Symbol::new(env, "error"), Symbol::new(env, "not_deposited")), ());'
)

content = content.replace(
    'env.events().publish(("error", Symbol::new(env, "already_cancelled")));',
    'env.events().publish((Symbol::new(env, "error"), Symbol::new(env, "already_cancelled")), ());'
)

content = content.replace(
    'env.events().publish(("error", Symbol::new(env, "invalid_index"), index));',
    'env.events().publish((Symbol::new(env, "error"), Symbol::new(env, "invalid_index")), index);'
)

content = content.replace(
    'env.events().publish(("error", Symbol::new(env, "not_completed"), index));',
    'env.events().publish((Symbol::new(env, "error"), Symbol::new(env, "not_completed")), index);'
)

content = content.replace(
    'env.events().publish(("error", Symbol::new(env, "is_disputed"), index));',
    'env.events().publish((Symbol::new(env, "error"), Symbol::new(env, "is_disputed")), index);'
)

content = content.replace(
    'env.events().publish(("error", Symbol::new(env, "already_withdrawn"), index));',
    'env.events().publish((Symbol::new(env, "error"), Symbol::new(env, "already_withdrawn")), index);'
)

content = content.replace(
    'env.events().publish(("error", Symbol::new(env, "no_freelancer_kyc")));',
    'env.events().publish((Symbol::new(env, "error"), Symbol::new(env, "no_freelancer_kyc")), ());'
)

with open("contracts/uctalent-escrow/src/escrow.rs", "w") as f:
    f.write(content)
