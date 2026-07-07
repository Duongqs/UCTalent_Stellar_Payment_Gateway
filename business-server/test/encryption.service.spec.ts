import { encrypt, decrypt, createBeneficiaryRefId } from '../src/services/encryption.service';

describe('EncryptionService (SEP-12 Vault)', () => {
  const TEST_SECRET = 'a_very_secure_secret_key_that_is_at_least_32_bytes_long!';

  beforeAll(() => {
    process.env.ENCRYPTION_SECRET = TEST_SECRET;
  });

  afterAll(() => {
    delete process.env.ENCRYPTION_SECRET;
  });

  // ─── Core encrypt/decrypt ─────────────────────────────────────────────

  describe('encrypt & decrypt', () => {
    it('should encrypt and decrypt a string correctly', () => {
      const plainText = '1234567890';
      const encryptedToken = encrypt(plainText);

      expect(encryptedToken).not.toBe(plainText);
      expect(encryptedToken.startsWith('v1:')).toBe(true);

      const decryptedText = decrypt(encryptedToken);
      expect(decryptedText).toBe(plainText);
    });

    it('should generate different ciphertexts for the same plaintext due to random IVs', () => {
      const plainText = 'secret_bank_account';
      const enc1 = encrypt(plainText);
      const enc2 = encrypt(plainText);

      expect(enc1).not.toBe(enc2);
      expect(decrypt(enc1)).toBe(plainText);
      expect(decrypt(enc2)).toBe(plainText);
    });

    it('should use different salts for each encryption (per-record random salt)', () => {
      const enc1 = encrypt('same_text');
      const enc2 = encrypt('same_text');

      // Format: v1:saltHex:ivHex:cipherHex
      const salt1 = enc1.split(':')[1];
      const salt2 = enc2.split(':')[1];

      expect(salt1).not.toBe(salt2); // Per-record random salt — defeats rainbow tables
    });

    it('should throw error on invalid token format', () => {
      expect(() => decrypt('invalid_token')).toThrow('Invalid encrypted token format');
    });

    it('should throw error on unsupported version', () => {
      const invalidToken = 'v2:salt:iv:cipher';
      expect(() => decrypt(invalidToken)).toThrow('Unsupported encryption version: v2. Key rotation may be needed.');
    });
  });

  // ─── ENCRYPTION_SECRET validation ─────────────────────────────────────

  describe('ENCRYPTION_SECRET validation', () => {
    it('should throw FATAL error if ENCRYPTION_SECRET is not set', () => {
      const originalSecret = process.env.ENCRYPTION_SECRET;
      delete process.env.ENCRYPTION_SECRET;

      expect(() => encrypt('test')).toThrow('FATAL: ENCRYPTION_SECRET environment variable is required');

      process.env.ENCRYPTION_SECRET = originalSecret;
    });

    it('should throw FATAL error if ENCRYPTION_SECRET is too short', () => {
      const originalSecret = process.env.ENCRYPTION_SECRET;
      process.env.ENCRYPTION_SECRET = 'short';

      expect(() => encrypt('test')).toThrow('ENCRYPTION_SECRET must be at least');

      process.env.ENCRYPTION_SECRET = originalSecret;
    });
  });

  // ─── createBeneficiaryRefId ───────────────────────────────────────────

  describe('createBeneficiaryRefId', () => {
    it('should generate a consistent HMAC hash for the same inputs', () => {
      const wallet = 'GABC123';
      const acc = '999999999';

      const hash1 = createBeneficiaryRefId(wallet, acc);
      const hash2 = createBeneficiaryRefId(wallet, acc);

      expect(hash1).toBe(hash2);
      expect(hash1.length).toBe(64); // hex representation of sha256
    });

    it('should generate different hashes for different inputs', () => {
      const hash1 = createBeneficiaryRefId('GABC123', '999999999');
      const hash2 = createBeneficiaryRefId('GABC124', '999999999');

      expect(hash1).not.toBe(hash2);
    });

    it('should produce different hashes when ENCRYPTION_SECRET changes (HMAC property)', () => {
      const hash1 = createBeneficiaryRefId('GABC123', '999999999');

      // Change key
      const originalSecret = process.env.ENCRYPTION_SECRET;
      process.env.ENCRYPTION_SECRET = 'different_secret_key_that_is_also_32_bytes!';

      const hash2 = createBeneficiaryRefId('GABC123', '999999999');

      // HMAC with different key → different hash (plain SHA256 would be identical)
      expect(hash1).not.toBe(hash2);

      process.env.ENCRYPTION_SECRET = originalSecret;
    });
  });
});
