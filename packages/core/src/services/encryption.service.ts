import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { EnvService } from '../config/env.service';

const ALGORITHM = 'aes-256-cbc';
const MIN_SECRET_LENGTH = 32;
const CURRENT_VERSION = 'v1';

function getSecretFallback(): string {
  const secret = process.env.ENCRYPTION_SECRET;
  if (!secret) {
    throw new Error('FATAL: ENCRYPTION_SECRET environment variable is required');
  }
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error(`FATAL: ENCRYPTION_SECRET must be at least ${MIN_SECRET_LENGTH} characters`);
  }
  return secret;
}

@Injectable()
export class EncryptionService {
  constructor(private readonly envService: EnvService) {}

  private getSecret(): string {
    const secret = this.envService ? this.envService.get('ENCRYPTION_SECRET') : getSecretFallback();
    if (!secret) {
      throw new Error('FATAL: ENCRYPTION_SECRET environment variable is required');
    }
    if (secret.length < MIN_SECRET_LENGTH) {
      throw new Error(`FATAL: ENCRYPTION_SECRET must be at least ${MIN_SECRET_LENGTH} characters`);
    }
    return secret;
  }

  private deriveKey(salt: Buffer): Buffer {
    return crypto.scryptSync(this.getSecret(), salt, 32);
  }

  encrypt(plaintext: string): string {
    const salt = crypto.randomBytes(16);
    const iv = crypto.randomBytes(16);
    const key = this.deriveKey(salt);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    return `${CURRENT_VERSION}:${salt.toString('hex')}:${iv.toString('hex')}:${encrypted.toString('hex')}`;
  }

  decrypt(token: string): string {
    const parts = token.split(':');
    if (parts.length !== 4) {
      throw new Error('Invalid encrypted token format');
    }

    const [version, saltHex, ivHex, cipherHex] = parts as [string, string, string, string];

    if (version !== 'v1') {
      throw new Error(`Unsupported encryption version: ${version}. Key rotation may be needed.`);
    }

    const salt = Buffer.from(saltHex, 'hex');
    const iv = Buffer.from(ivHex, 'hex');
    const key = this.deriveKey(salt);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);

    return decipher.update(cipherHex, 'hex', 'utf8') + decipher.final('utf8');
  }

  createBeneficiaryRefId(stellarWallet: string, accountNumber: string): string {
    const hmac = crypto.createHmac('sha256', this.getSecret());
    hmac.update(`${stellarWallet}:${accountNumber}`);
    return hmac.digest('hex');
  }
}

