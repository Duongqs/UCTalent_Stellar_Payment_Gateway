
import { EncryptionService } from "./packages/core/src/services/encryption.service";
import { EnvService } from "./packages/core/src/config/env.service";
import { DataSource } from "typeorm";

async function run() {
  // Use a mock EnvService that returns our secret
  class MockEnvService {
    get(key: string) {
      if (key === "ENCRYPTION_SECRET") return "uctalent-dev-pii-secret-12345678";
      return undefined;
    }
  }
  const envService = new MockEnvService() as unknown as EnvService;
  const encryption = new EncryptionService(envService);

  const ds = new DataSource({
    type: "postgres",
    host: "127.0.0.1",
    port: 15432,
    username: "uct_rails_dev_root",
    password: "DcglAQ2zrRNMiihqm1AMmVwBuY8q3ebB",
    database: "uct_cross_border_dev",
  });

  await ds.initialize();
  const profiles = await ds.query("SELECT * FROM bank_profiles");
  for (const p of profiles) {
     try {
       const acc = encryption.decrypt(p.encrypted_account);
       const name = encryption.decrypt(p.encrypted_name);
       console.log(`- customerId: ${p.customer_id}, acc: ${acc}, name: ${name}`);
     } catch (e) {
       console.log(`Failed decrypting ${p.customer_id}: ${e.message}`);
     }
  }
  await ds.destroy();
}
run().catch(console.error);

