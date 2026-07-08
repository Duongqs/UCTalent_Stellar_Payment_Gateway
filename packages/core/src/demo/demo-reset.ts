import { Pool } from 'pg';
import * as crypto from 'crypto';
import * as dotenv from 'dotenv';

dotenv.config();

const host = process.env.POSTGRES_HOST || 'localhost';
const port = parseInt(process.env.POSTGRES_PORT || '15432', 10);
const user = process.env.POSTGRES_USER || 'uct_rails_dev_root';
const password = process.env.POSTGRES_PASSWORD || '';
const database = process.env.POSTGRES_DB || 'uct_cross_border_dev';

export const pool = new Pool({
  host,
  port,
  user,
  password,
  database,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

async function query(text: string, params?: any[]) {
  const result = await pool.query(text, params);
  return result.rows[0] ?? null;
}

const KYC_SALT = process.env.KYC_SALT || 'uctalent-salt-2026';

async function reset() {
  console.log('🧹 Resetting UCTalent Cross-Border Demo Data...');

  const devKycId = crypto.createHash('sha256').update('kyc_dev_001' + KYC_SALT).digest('hex');
  const scoutKycId = crypto.createHash('sha256').update('kyc_scout_001' + KYC_SALT).digest('hex');

  const recruiterId = 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d';
  const talentId = 'c3d4e5f6-a7b8-9c0d-1e2f-3a4b5c6d7e8f';
  const scoutId = 'e5f6a7b8-c9d0-1e2f-3a4b-5c6d7e8f9a0b';
  const orgId = 'b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e';
  const jobId = 'f6a7b8c9-d0e1-2f3a-4b5c-6d7e8f9a0b1c';

  try {
    await query('BEGIN');

    // 1. Clean up payment distributions related to this job
    console.log('  Deleting payment distributions...');
    await query('DELETE FROM payment_distributions WHERE job_id = $1', [jobId]);

    // 2. Clean up bridge transactions / audit logs
    console.log('  Clearing sep31_transactions, audit logs, and event queue...');
    await query('TRUNCATE TABLE sep31_transactions RESTART IDENTITY CASCADE');
    await query('TRUNCATE TABLE disbursement_audit_log RESTART IDENTITY CASCADE');
    await query('TRUNCATE TABLE bridge_events_queue RESTART IDENTITY CASCADE');

    // 3. Clean up job
    console.log('  Deleting job...');
    await query('DELETE FROM jobs WHERE id = $1', [jobId]);

    // 4. Clean up bank accounts
    console.log('  Deleting bank accounts...');
    await query('DELETE FROM user_bank_accounts WHERE kyc_id IN ($1, $2)', [devKycId, scoutKycId]);

    // 5. Clean up talent profile
    console.log('  Deleting talent profile...');
    await query('DELETE FROM talents WHERE user_id = $1', [talentId]);

    // 6. Clean up users
    console.log('  Deleting demo users...');
    await query('DELETE FROM users WHERE id IN ($1, $2, $3)', [recruiterId, talentId, scoutId]);

    // 7. Clean up organization
    console.log('  Deleting organization...');
    await query('DELETE FROM organizations WHERE id = $1', [orgId]);

    await query('COMMIT');
    console.log('✅ Demo reset completed successfully!');
  } catch (err) {
    await query('ROLLBACK');
    console.error('❌ Reset failed:', err);
  } finally {
    await pool.end();
  }
}

reset();
