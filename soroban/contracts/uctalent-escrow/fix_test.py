import re

with open('src/test.rs', 'r') as f:
    content = f.read()

# Fix default_config
content = content.replace('''        EscrowConfig {
            client: self.client.clone(),
            developer: self.developer.clone(),
            platform_address: self.platform.clone(),
            anchor_address: self.anchor.clone(),
            token: self.token_id.clone(),
            bounty_amount: token.balance(&self.client),
            scout_rate: 8000,
            platform_rate: 2000,
            expiry_ledger,
            developer_kyc_id: BytesN::from_array(&self.env, &[1u8; 32]),
            scout_kyc_id: BytesN::from_array(&self.env, &[2u8; 32]),
        }''', '''        EscrowConfig {
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
        }''')

# Fix confirm_placement -> completely remove it, replace with nothing
content = re.sub(r'\s*ec\.confirm_placement\([^;]+;\n', '\n', content)

# Fix release_bounty
# ec.release_bounty(&ctx.client); -> ec.release_bounty(&ctx.client, &true, &BytesN::from_array(&ctx.env, &[0u8; 32]));
content = re.sub(
    r'ec\.release_bounty\(&ctx\.client\);',
    r'ec.release_bounty(&ctx.client, &true, &BytesN::from_array(&ctx.env, &[0u8; 32]));',
    content
)

# Fix try_release_bounty
content = re.sub(
    r'ec\.try_release_bounty\(&ctx\.client\)',
    r'ec.try_release_bounty(&ctx.client, &true, &BytesN::from_array(&ctx.env, &[0u8; 32]))',
    content
)

# Fix assert!(status.is_confirmed);
content = re.sub(r'\s*assert!\(status\.is_confirmed\);\n', '\n', content)

# Fix submit_milestone, claim_timeout_payout -> remove
content = re.sub(r'\s*ec\.submit_milestone\([^;]+;\n', '\n', content)
content = re.sub(r'\s*ec\.claim_timeout_payout\([^;]+;\n', '\n', content)

# Fix sign_milestone -> release_milestone
content = re.sub(r'ec\.sign_milestone\(', 'ec.release_milestone(', content)

# Fix try_sign_milestone -> try_release_milestone
content = re.sub(r'ec\.try_sign_milestone\(', 'ec.try_release_milestone(', content)

# Fix assert!(ms.submitted_at.is_some());
content = re.sub(r'\s*assert!\(ms\.submitted_at\.is_some\(\)\);\n', '\n', content)
content = re.sub(r'\s*assert!\(ms\.client_timeout_at\.is_some\(\)\);\n', '\n', content)

# Fix config.freelancer = placeholder_freelancer; -> remove
content = re.sub(r'\s*config\.freelancer = placeholder_freelancer;\n', '\n', content)

# Fix admin_set_freelancer, admin_set_scout -> remove
content = re.sub(r'\s*ec\.admin_set_freelancer\([^;]+;\n', '\n', content)
content = re.sub(r'\s*ec\.admin_set_scout\([^;]+;\n', '\n', content)

# Fix status.has_scout = true; -> remove
content = re.sub(r'\s*status\.has_scout = true;\n', '\n', content)

# Fix status.scout_kyc_id = scout_kyc_id; -> remove
content = re.sub(r'\s*status\.scout_kyc_id = scout_kyc_id;\n', '\n', content)

with open('src/test.rs', 'w') as f:
    f.write(content)

