const crypto = require('crypto');
const { DataSource } = require('typeorm');

const ALGORITHM = 'aes-256-cbc';
const SECRET = 'super_secret_jwt_key_that_is_at_least_32_bytes_long!';

function deriveKey(salt) {
  return crypto.scryptSync(SECRET, salt, 32);
}

function decrypt(token) {
  const parts = token.split(':');
  if (parts.length !== 4) throw new Error('Invalid encrypted token format');
  const [version, saltHex, ivHex, cipherHex] = parts;
  if (version !== 'v1') throw new Error(`Unsupported encryption version: ${version}`);
  const salt = Buffer.from(saltHex, 'hex');
  const iv = Buffer.from(ivHex, 'hex');
  const key = deriveKey(salt);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  return decipher.update(cipherHex, 'hex', 'utf8') + decipher.final('utf8');
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
  const profiles = await ds.query("SELECT * FROM bank_profiles");
  console.log("Profiles count:", profiles.length);
  let successCount = 0;
  for (const p of profiles) {
    try {
      const acc = decrypt(p.encrypted_account);
      console.log(`- customerId: ${p.customer_id}, acc: ${acc}`);
      successCount++;
    } catch (e) {
      console.log(`Failed decrypting ${p.customer_id}: ${e.message}`);
    }
  }
  console.log("Success count:", successCount);
  await ds.destroy();
}
run().catch(console.error);
