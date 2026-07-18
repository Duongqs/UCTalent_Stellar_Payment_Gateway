import { NestFactory } from '@nestjs/core';
import { EncryptionService } from './packages/core/src/services/encryption.service';
import { ConfigModule, ConfigService } from '@nestjs/config';

async function bootstrap() {
  const svc = new EncryptionService(new ConfigService({
     PII_ENCRYPTION_KEY: 'uctalent-dev-pii-secret-12345678'
  }));

  // I need to read the db directly again
  const { DataSource } = require('typeorm');
  const ds = new DataSource({
    type: 'postgres',
    host: '127.0.0.1',
    port: 15432,
    username: 'uct_rails_dev_root',
    password: 'DcglAQ2zrRNMiihqm1AMmVwBuY8q3ebB',
    database: 'uct_cross_border_dev',
  });
  await ds.initialize();
  const profiles = await ds.query('SELECT * FROM bank_profiles');
  for (const p of profiles) {
     try {
       const acc = svc.decrypt(p.encrypted_account);
       const name = svc.decrypt(p.encrypted_name);
       console.log(`- customerId: ${p.customer_id}, acc: ${acc}, name: ${name}`);
     } catch (e) {
       console.log(`Failed decrypting ${p.customer_id}: ${e.message}`);
     }
  }
  await ds.destroy();
}
bootstrap();
