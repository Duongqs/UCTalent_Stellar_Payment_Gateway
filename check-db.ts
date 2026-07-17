import { DataSource } from 'typeorm';

const ds = new DataSource({
  type: 'postgres',
  host: '127.0.0.1',
  port: 15432,
  username: 'uct_rails_dev_root',
  password: 'DcglAQ2zrRNMiihqm1AMmVwBuY8q3ebB',
  database: 'uct_cross_border_dev',
});

async function run() {
  await ds.initialize();
  
  const profiles = await ds.query('SELECT * FROM bank_profiles');
  console.log("BANK PROFILES:", profiles.length);
  for (const p of profiles) {
     console.log(`- customerId: ${p.customer_id}, bankCode: ${p.bank_code}, beneficiaryRefId: ${p.beneficiary_ref_id}`);
  }
  
  const accounts = await ds.query('SELECT * FROM user_bank_accounts');
  console.log("USER BANK ACCOUNTS:", accounts.length);
  for (const a of accounts) {
     console.log(`- userId: ${a.user_id}, kycId: ${a.kyc_id}, bankCode: ${a.bank_code}, accountNumber: ${a.account_number}, name: ${a.account_name}`);
  }
  
  await ds.destroy();
}
run().catch(console.error);
