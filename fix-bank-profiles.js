const crypto = require('crypto');
const { DataSource } = require('typeorm');

const PII_KEY = 'uctalent-dev-pii-secret-12345678';
const ENCRYPTION_SECRET = 'uctalent-dev-pii-secret-12345678';
const ALGORITHM_CBC = 'aes-256-cbc';

function decryptGCM(value) {
  if (!value || !value.includes(':')) return value;
  const [ivHex, authTagHex, encryptedHex] = value.split(':');
  const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(PII_KEY), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

function deriveKey(salt) {
  return crypto.scryptSync(ENCRYPTION_SECRET, salt, 32);
}

function encryptCBC(plaintext) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(16);
  const key = deriveKey(salt);
  const cipher = crypto.createCipheriv(ALGORITHM_CBC, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  return `v1:${salt.toString('hex')}:${iv.toString('hex')}:${encrypted.toString('hex')}`;
}

async function run() {
  const ds = new DataSource({
    type: "postgres",
    host: "100.85.11.97",
    port: 15432,
    username: "uct_rails_dev_root",
    password: "xkGFNcvkY9SMiqPz0qvpxBXdKCWhUEUNsAKzYIoNkfe1eD8dtM",
    database: "uct_cross_border_dev",
  });
  await ds.initialize();
  
  const profiles = await ds.query("SELECT customer_id FROM bank_profiles");
  console.log(`Found ${profiles.length} profiles to fix`);
  
  let successCount = 0;
  for (const p of profiles) {
    const kyc_id = p.customer_id;
    const accounts = await ds.query("SELECT account_number, account_name FROM user_bank_accounts WHERE kyc_id = $1", [kyc_id]);
    if (accounts.length > 0) {
      const acc = accounts[0];
      try {
        const plainAccountNumber = decryptGCM(acc.account_number);
        const plainName = acc.account_name;
        
        const newEncryptedAccount = encryptCBC(plainAccountNumber);
        const newEncryptedName = encryptCBC(plainName);
        
        await ds.query("UPDATE bank_profiles SET encrypted_account = $1, encrypted_name = $2 WHERE customer_id = $3", [newEncryptedAccount, newEncryptedName, kyc_id]);
        console.log(`Fixed profile for ${kyc_id}`);
        successCount++;
      } catch (e) {
        console.log(`Failed to fix ${kyc_id}: ${e.message}`);
      }
    } else {
      console.log(`No user_bank_accounts found for kyc_id ${kyc_id}`);
    }
  }
  
  console.log(`Successfully fixed ${successCount} profiles!`);
  await ds.destroy();
}
run().catch(console.error);
