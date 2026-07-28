import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { EnvService } from '../config/env.service';

const ALGORITHM_V1 = 'aes-256-cbc';
const ALGORITHM_V2 = 'aes-256-gcm';
const MIN_SECRET_LENGTH = 32;
const CURRENT_VERSION = 'v2';

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
    const iv = crypto.randomBytes(12); // GCM standard IV size
    const key = this.deriveKey(salt);
    const cipher = crypto.createCipheriv(ALGORITHM_V2, key, iv);
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    return `${CURRENT_VERSION}:${salt.toString('hex')}:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
  }

  decrypt(token: string): string {
    const parts = token.split(':');
    const version = parts[0];

    if (version === 'v1') {
      if (parts.length !== 4) throw new Error('Invalid v1 encrypted token format');
      const [, saltHex, ivHex, cipherHex] = parts;
      const salt = Buffer.from(saltHex, 'hex');
      const iv = Buffer.from(ivHex, 'hex');
      const key = this.deriveKey(salt);
      const decipher = crypto.createDecipheriv(ALGORITHM_V1, key, iv);
      return decipher.update(cipherHex, 'hex', 'utf8') + decipher.final('utf8');
    }

    if (version === 'v2') {
      if (parts.length !== 5) throw new Error('Invalid v2 encrypted token format');
      const [, saltHex, ivHex, authTagHex, cipherHex] = parts;
      const salt = Buffer.from(saltHex, 'hex');
      const iv = Buffer.from(ivHex, 'hex');
      const authTag = Buffer.from(authTagHex, 'hex');
      const key = this.deriveKey(salt);
      const decipher = crypto.createDecipheriv(ALGORITHM_V2, key, iv);
      decipher.setAuthTag(authTag);
      return decipher.update(cipherHex, 'hex', 'utf8') + decipher.final('utf8');
    }

    throw new Error(`Unsupported encryption version: ${version}. Key rotation may be needed.`);
  }

  createBeneficiaryRefId(stellarWallet: string, accountNumber: string): string {
    const hmac = crypto.createHmac('sha256', this.getSecret());
    hmac.update(`${stellarWallet}:${accountNumber}`);
    return hmac.digest('hex');
  }
}

