const crypto = require('crypto');
const { pool } = require('./db.service');

async function resolveBankDetailsFromKyc(kycId, party) {
  const platformBank = {
    bankCode: process.env.PLATFORM_BANK_CODE || 'BIDV',
    accountNumber: process.env.PLATFORM_ACCOUNT_NUMBER || '96311300000170179',
    accountName: process.env.PLATFORM_ACCOUNT_NAME || 'UCTALENT PLATFORM',
  };

  if (party === 'platform' || !kycId) {
    return platformBank;
  }

  const hashStr = Buffer.isBuffer(kycId) ? kycId.toString('hex') : String(kycId || '');

  try {
    const res = await pool.query('SELECT * FROM bank_profiles WHERE beneficiary_ref_id = $1', [hashStr]);
    const profile = res.rows[0];
    
    if (!profile) {
      console.warn(`[KYC] No bank profile found for KYC ID: ${hashStr}`);
      return platformBank;
    }

    const PII_ENCRYPTION_KEY = process.env.PII_ENCRYPTION_KEY || '12345678901234567890123456789012';
    function decrypt(encryptedText) {
      const parts = encryptedText.split(':');
      if (parts.length !== 3) return 'UNKNOWN';
      const iv = Buffer.from(parts[0], 'hex');
      const authTag = Buffer.from(parts[1], 'hex');
      const encryptedData = parts[2];
      const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(PII_ENCRYPTION_KEY), iv);
      decipher.setAuthTag(authTag);
      let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    }

    return {
      bankCode: profile.bank_code,
      accountNumber: decrypt(profile.encrypted_account),
      accountName: decrypt(profile.encrypted_name),
    };
  } catch (err) {
    console.error(`[KYC] Error resolving bank details: ${err.message}`);
    return platformBank;
  }
}

module.exports = {
  resolveBankDetailsFromKyc
};
