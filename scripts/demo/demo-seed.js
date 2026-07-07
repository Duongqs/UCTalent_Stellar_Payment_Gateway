/**
 * UC Talent Cross-Border Integration Demo Seed Script
 * Seeds the database with all necessary entities for the Stellar Hackathon Demo.
 */

'use strict';

const { Pool } = require('pg');
const crypto = require('crypto');
require('dotenv').config();

const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || 'password',
  database: process.env.POSTGRES_DB || 'uctalent_dev',

});

// Encryption configuration
const PII_KEY = process.env.PII_ENCRYPTION_KEY || '12345678901234567890123456789012';
const KYC_SALT = process.env.KYC_SALT || 'uctalent-salt-2026';

function encryptAccountNumber(accountNumber) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(PII_KEY), iv);
  let encrypted = cipher.update(accountNumber, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

function computeKycId(seed) {
  return crypto.createHash('sha256').update(seed + KYC_SALT).digest('hex');
}

async function seed() {
  console.log('🌱 Starting UCTalent Cross-Border Demo Seeding...');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Seed Recruiter (Employer)
    const recruiterEmail = 'test-recruiter@example.com';
    const recruiterId = 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d';
    const recruiterRes = await client.query('SELECT id FROM users WHERE email = $1', [recruiterEmail]);
    if (recruiterRes.rows.length === 0) {
      console.log('  Adding Recruiter User...');
      await client.query(`
        INSERT INTO users (id, name, email, encrypted_password, created_at, updated_at)
        VALUES ($1, 'Test Recruiter', $2, 'noop', NOW(), NOW())
      `, [recruiterId, recruiterEmail]);
    } else {
      console.log('  Recruiter User already exists.');
    }

    // 2. Seed Organization
    const orgId = 'b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e';
    const orgRes = await client.query('SELECT id FROM organizations WHERE id = $1', [orgId]);
    if (orgRes.rows.length === 0) {
      console.log('  Adding Organization...');
      await client.query(`
        INSERT INTO organizations (id, name, status, created_at, updated_at)
        VALUES ($1, 'Test Company', 'active', NOW(), NOW())
      `, [orgId]);
    } else {
      console.log('  Organization already exists.');
    }

    // 3. Seed Talent (Vietnamese Freelancer Nguyen Van A)
    const talentEmail = 'test-talent@example.com';
    const talentId = 'c3d4e5f6-a7b8-9c0d-1e2f-3a4b5c6d7e8f';
    const talentRes = await client.query('SELECT id FROM users WHERE email = $1', [talentEmail]);
    if (talentRes.rows.length === 0) {
      console.log('  Adding Talent User Nguyen Van A...');
      await client.query(`
        INSERT INTO users (id, name, email, encrypted_password, created_at, updated_at)
        VALUES ($1, 'Nguyen Van A', $2, 'noop', NOW(), NOW())
      `, [talentId, talentEmail]);
    } else {
      console.log('  Talent User already exists.');
    }

    // Seed Talent profile
    const talentProfileId = 'd4e5f6a7-b8c9-0d1e-2f3a-4b5c6d7e8f9a';
    const profileRes = await client.query('SELECT id FROM talents WHERE id = $1', [talentProfileId]);
    if (profileRes.rows.length === 0) {
      console.log('  Adding Talent Profile...');
      await client.query(`
        INSERT INTO talents (id, user_id, status, created_at, updated_at)
        VALUES ($1, $2, 'active', NOW(), NOW())
      `, [talentProfileId, talentId]);
    }

    // 4. Seed Scout (Nguyen Van B)
    const scoutEmail = 'test-scout@example.com';
    const scoutId = 'e5f6a7b8-c9d0-1e2f-3a4b-5c6d7e8f9a0b';
    const scoutRes = await client.query('SELECT id FROM users WHERE email = $1', [scoutEmail]);
    if (scoutRes.rows.length === 0) {
      console.log('  Adding Scout User Nguyen Van B...');
      await client.query(`
        INSERT INTO users (id, name, email, encrypted_password, created_at, updated_at)
        VALUES ($1, 'Nguyen Van B', $2, 'noop', NOW(), NOW())
      `, [scoutId, scoutEmail]);
    } else {
      console.log('  Scout User already exists.');
    }

    // 5. Seed Bank Accounts for Developer and Scout
    const devKycId = computeKycId('kyc_dev_001');
    const scoutKycId = computeKycId('kyc_scout_001');

    // Developer Bank Account: BIDV, Account: 96311300000169969
    const devBankRes = await client.query('SELECT id FROM user_bank_accounts WHERE kyc_id = $1', [devKycId]);
    if (devBankRes.rows.length === 0) {
      console.log('  Adding Developer Bank Account (BIDV)...');
      await client.query(`
        INSERT INTO user_bank_accounts (id, user_id, bank_code, account_number, account_name, kyc_id, is_default, created_at, updated_at)
        VALUES (uuid_generate_v4(), $1, 'BIDV', $2, 'NGUYEN VAN A', $3, true, NOW(), NOW())
      `, [talentId, encryptAccountNumber('96311300000169969'), devKycId]);
    } else {
      console.log('  Developer Bank Account already exists.');
    }

    // Scout Bank Account: TCB (Techcombank), Account: 96311300000170170
    const scoutBankRes = await client.query('SELECT id FROM user_bank_accounts WHERE kyc_id = $1', [scoutKycId]);
    if (scoutBankRes.rows.length === 0) {
      console.log('  Adding Scout Bank Account (TCB)...');
      await client.query(`
        INSERT INTO user_bank_accounts (id, user_id, bank_code, account_number, account_name, kyc_id, is_default, created_at, updated_at)
        VALUES (uuid_generate_v4(), $1, 'TCB', $2, 'NGUYEN VAN B', $3, true, NOW(), NOW())
      `, [scoutId, encryptAccountNumber('96311300000170170'), scoutKycId]);
    } else {
      console.log('  Scout Bank Account already exists.');
    }

    // 6. Seed Freelance Job (with Milestones)
    const jobId = 'f6a7b8c9-d0e1-2f3a-4b5c-6d7e8f9a0b1c';
    const jobRes = await client.query('SELECT id FROM jobs WHERE id = $1', [jobId]);
    if (jobRes.rows.length === 0) {
      console.log('  Adding Freelance Job...');
      
      const maxNumRes = await client.query('SELECT COALESCE(MAX(job_number), 0) as max_num FROM jobs');
      const nextJobNum = parseInt(maxNumRes.rows[0].max_num, 10) + 1;

      await client.query(`
        INSERT INTO jobs (
          id, job_number, title, status, is_freelance, milestones, 
          organization_id, created_by, created_at, updated_at, 
          referral_cents, referral_currency, referral_type
        )
        VALUES ($1, $2, 'Senior Full-Stack Developer (Cross-Border Dev)', 'published', true, '[500, 300, 200]', $3, $4, NOW(), NOW(), 1000, 'USDC', 'none')
      `, [jobId, nextJobNum, orgId, recruiterId]);
      console.log(`  Seeded Job #${nextJobNum} with ID: ${jobId}`);
    } else {
      console.log('  Freelance Job already exists.');
    }

    await client.query('COMMIT');
    console.log('✅ Seeding completed successfully!');
    console.log(`
ℹ️  Demo Setup Information:
    ----------------------------------------------------------------------
    Recruiter User ID  : ${recruiterId}
    Recruiter Email    : ${recruiterEmail}
    Talent User ID     : ${talentId} (Nguyen Van A)
    Talent Email       : ${talentEmail}
    Talent KYC ID      : ${devKycId}
    Talent Bank Code   : BIDV
    Scout User ID      : ${scoutId} (Nguyen Van B)
    Scout KYC ID       : ${scoutKycId}
    Scout Bank Code    : TCB
    Job ID             : ${jobId}
    Job Milestones     : $500 (Milestone 1), $300 (Milestone 2), $200 (Milestone 3)
    ----------------------------------------------------------------------
    `);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Seeding failed:', err);
  } finally {
    client.release();
    pool.end();
  }
}

seed();
