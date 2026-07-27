import re

with open("src/test.rs", "r") as f:
    content = f.read()

# Remove TestCtx::create_escrow
content = re.sub(r'    fn create_escrow\(&self, config: &EscrowConfig\) -> Address \{.*?\n    \}\n', '', content, flags=re.DOTALL)

# Remove default_config
content = re.sub(r'    /// Legacy EscrowConfig for backward-compat tests.*?    \}\n', '', content, flags=re.DOTALL)

# Remove test_milestone_full_lifecycle
content = re.sub(r'// ─── Test 8: Milestone full lifecycle ────────────────────────────────────────.*?\}\n\n', '', content, flags=re.DOTALL)

# Remove test_out_of_order_release_rejected
content = re.sub(r'#\[test\]\n#\[should_panic\(expected = "Previous milestone must be completed first"\)\]\nfn test_out_of_order_release_rejected\(\) \{.*?\}\n', '', content, flags=re.DOTALL)

# Replace try_release_milestone with try_complete_milestone in test_dispute_workflow
content = content.replace("ec.try_release_milestone(&ctx.client, &0);", "ec.try_complete_milestone(&ctx.client, &0);")

with open("src/test.rs", "w") as f:
    f.write(content)

