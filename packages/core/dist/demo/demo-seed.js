"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.pool = void 0;
const pg_1 = require("pg");
const encryption_service_1 = require("../services/encryption.service");
const env_service_1 = require("../config/env.service");
const env_config_1 = require("../config/env.config");
const crypto = __importStar(require("crypto"));
const dotenv = __importStar(require("dotenv"));
dotenv.config();
const envConfig = env_config_1.envSchema.safeParse(process.env).data || {};
const mockConfigService = {
    get: (key) => envConfig[key],
};
const envService = new env_service_1.EnvService(mockConfigService);
const encryptionService = new encryption_service_1.EncryptionService(envService);
function encrypt(text) {
    return encryptionService.encrypt(text);
}
const host = process.env.POSTGRES_HOST || 'localhost';
const port = parseInt(process.env.POSTGRES_PORT || '15432', 10);
const user = process.env.POSTGRES_USER || 'uct_rails_dev_root';
const password = process.env.POSTGRES_PASSWORD || '';
const database = process.env.POSTGRES_DB || 'uct_cross_border_dev';
exports.pool = new pg_1.Pool({
    host,
    port,
    user,
    password,
    database,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
});
async function query(text, params) {
    const result = await exports.pool.query(text, params);
    return result.rows[0] ?? null;
}
const KYC_SALT = process.env.KYC_SALT || 'uctalent-salt-2026';
function computeKycId(seedStr) {
    return crypto.createHash('sha256').update(seedStr + KYC_SALT).digest('hex');
}
async function seed() {
    console.log('🌱 Starting UCTalent Cross-Border Demo Seeding...');
    try {
        await query('BEGIN');
        const recruiterEmail = 'test-recruiter@example.com';
        const recruiterId = 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d';
        const recruiterRes = await queryAll('SELECT id FROM users WHERE email = $1', [recruiterEmail]);
        if (recruiterRes.length === 0) {
            console.log('  Adding Recruiter User...');
            await query(`
        INSERT INTO users (id, name, email, encrypted_password, created_at, updated_at)
        VALUES ($1, 'Test Recruiter', $2, 'noop', NOW(), NOW())
      `, [recruiterId, recruiterEmail]);
        }
        else {
            console.log('  Recruiter User already exists.');
        }
        const orgId = 'b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e';
        const orgRes = await queryAll('SELECT id FROM organizations WHERE id = $1', [orgId]);
        if (orgRes.length === 0) {
            console.log('  Adding Organization...');
            await query(`
        INSERT INTO organizations (id, name, status, created_at, updated_at)
        VALUES ($1, 'Test Company', 'active', NOW(), NOW())
      `, [orgId]);
        }
        else {
            console.log('  Organization already exists.');
        }
        const talentEmail = 'test-talent@example.com';
        const talentId = 'c3d4e5f6-a7b8-9c0d-1e2f-3a4b5c6d7e8f';
        const talentRes = await queryAll('SELECT id FROM users WHERE email = $1', [talentEmail]);
        if (talentRes.length === 0) {
            console.log('  Adding Talent User Nguyen Van A...');
            await query(`
        INSERT INTO users (id, name, email, encrypted_password, created_at, updated_at)
        VALUES ($1, 'Nguyen Van A', $2, 'noop', NOW(), NOW())
      `, [talentId, talentEmail]);
        }
        else {
            console.log('  Talent User already exists.');
        }
        const talentProfileId = 'd4e5f6a7-b8c9-0d1e-2f3a-4b5c6d7e8f9a';
        const profileRes = await queryAll('SELECT id FROM talents WHERE id = $1', [talentProfileId]);
        if (profileRes.length === 0) {
            console.log('  Adding Talent Profile...');
            await query(`
        INSERT INTO talents (id, user_id, status, created_at, updated_at)
        VALUES ($1, $2, 'active', NOW(), NOW())
      `, [talentProfileId, talentId]);
        }
        const scoutEmail = 'test-scout@example.com';
        const scoutId = 'e5f6a7b8-c9d0-1e2f-3a4b-5c6d7e8f9a0b';
        const scoutRes = await queryAll('SELECT id FROM users WHERE email = $1', [scoutEmail]);
        if (scoutRes.length === 0) {
            console.log('  Adding Scout User Nguyen Van B...');
            await query(`
        INSERT INTO users (id, name, email, encrypted_password, created_at, updated_at)
        VALUES ($1, 'Nguyen Van B', $2, 'noop', NOW(), NOW())
      `, [scoutId, scoutEmail]);
        }
        else {
            console.log('  Scout User already exists.');
        }
        const devKycId = computeKycId('kyc_dev_001');
        const scoutKycId = computeKycId('kyc_scout_001');
        const devBankRes = await queryAll('SELECT id FROM user_bank_accounts WHERE kyc_id = $1', [devKycId]);
        if (devBankRes.length === 0) {
            console.log('  Adding Developer Bank Account (BIDV)...');
            await query(`
        INSERT INTO user_bank_accounts (id, user_id, bank_code, account_number, account_name, kyc_id, is_default, created_at, updated_at)
        VALUES (uuid_generate_v4(), $1, 'BIDV', $2, 'NGUYEN VAN A', $3, true, NOW(), NOW())
      `, [talentId, encrypt('96311300000169969'), devKycId]);
        }
        else {
            console.log('  Developer Bank Account already exists.');
        }
        const scoutBankRes = await queryAll('SELECT id FROM user_bank_accounts WHERE kyc_id = $1', [scoutKycId]);
        if (scoutBankRes.length === 0) {
            console.log('  Adding Scout Bank Account (TCB)...');
            await query(`
        INSERT INTO user_bank_accounts (id, user_id, bank_code, account_number, account_name, kyc_id, is_default, created_at, updated_at)
        VALUES (uuid_generate_v4(), $1, 'TCB', $2, 'NGUYEN VAN B', $3, true, NOW(), NOW())
      `, [scoutId, encrypt('96311300000170170'), scoutKycId]);
        }
        else {
            console.log('  Scout Bank Account already exists.');
        }
        const jobId = 'f6a7b8c9-d0e1-2f3a-4b5c-6d7e8f9a0b1c';
        const jobRes = await queryAll('SELECT id FROM jobs WHERE id = $1', [jobId]);
        if (jobRes.length === 0) {
            console.log('  Adding Freelance Job...');
            const maxNumRes = await queryAll('SELECT COALESCE(MAX(job_number), 0) as max_num FROM jobs');
            const nextJobNum = parseInt(maxNumRes[0]?.max_num || '0', 10) + 1;
            await query(`
        INSERT INTO jobs (
          id, job_number, title, status, is_freelance, milestones, 
          organization_id, created_by, created_at, updated_at, 
          referral_cents, referral_currency, referral_type
        )
        VALUES ($1, $2, 'Senior Full-Stack Developer (Cross-Border Dev)', 'published', true, '[500, 300, 200]', $3, $4, NOW(), NOW(), 1000, 'USDC', 'none')
      `, [jobId, nextJobNum, orgId, recruiterId]);
            console.log(`  Seeded Job #${nextJobNum} with ID: ${jobId}`);
        }
        else {
            console.log('  Freelance Job already exists.');
        }
        await query('COMMIT');
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
    }
    catch (err) {
        await query('ROLLBACK');
        console.error('❌ Seeding failed:', err);
    }
    finally {
        await exports.pool.end();
    }
}
async function queryAll(text, params) {
    const result = await exports.pool.query(text, params);
    return result.rows;
}
seed();
//# sourceMappingURL=demo-seed.js.map