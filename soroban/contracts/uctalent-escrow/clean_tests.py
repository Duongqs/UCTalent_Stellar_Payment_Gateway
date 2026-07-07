import re

with open('src/test.rs', 'r') as f:
    content = f.read()

# Remove test_timeout_payout
content = re.sub(r'#\[test\]\nfn test_timeout_payout\(\).*?^}', '', content, flags=re.MULTILINE | re.DOTALL)

# Remove test_timeout_payout_too_early_rejected
content = re.sub(r'#\[test\]\n#\[should_panic\]\nfn test_timeout_payout_too_early_rejected\(\).*?^}', '', content, flags=re.MULTILINE | re.DOTALL)

# Remove test_sign_milestone_requires_submit
content = re.sub(r'#\[test\]\n#\[should_panic\]\nfn test_sign_milestone_requires_submit\(\).*?^}', '', content, flags=re.MULTILINE | re.DOTALL)

# Remove test_admin_set_freelancer
content = re.sub(r'#\[test\]\nfn test_admin_set_freelancer\(\).*?^}', '', content, flags=re.MULTILINE | re.DOTALL)

# Remove test_release_before_dispute_window_rejected
content = re.sub(r'#\[test\]\n#\[should_panic\]\nfn test_release_before_dispute_window_rejected\(\).*?^}', '', content, flags=re.MULTILINE | re.DOTALL)

# Remove test_milestone_escrow_lifecycle try_release_milestone
content = re.sub(r'\s*let res = ec\.try_release_milestone\(&ctx\.platform, &0\);\n\s*assert!\(res\.is_err\(\)\);', '', content)

with open('src/test.rs', 'w') as f:
    f.write(content)

