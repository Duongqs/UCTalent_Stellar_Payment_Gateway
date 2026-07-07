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
const db_1 = require("../db");
const crypto = __importStar(require("crypto"));
const dotenv = __importStar(require("dotenv"));
dotenv.config();
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
        await (0, db_1.query)('BEGIN');
        console.log('  Deleting payment distributions...');
        await (0, db_1.query)('DELETE FROM payment_distributions WHERE job_id = $1', [jobId]);
        console.log('  Clearing sep31_transactions, audit logs, and event queue...');
        await (0, db_1.query)('TRUNCATE TABLE sep31_transactions RESTART IDENTITY CASCADE');
        await (0, db_1.query)('TRUNCATE TABLE disbursement_audit_log RESTART IDENTITY CASCADE');
        await (0, db_1.query)('TRUNCATE TABLE bridge_events_queue RESTART IDENTITY CASCADE');
        console.log('  Deleting job...');
        await (0, db_1.query)('DELETE FROM jobs WHERE id = $1', [jobId]);
        console.log('  Deleting bank accounts...');
        await (0, db_1.query)('DELETE FROM user_bank_accounts WHERE kyc_id IN ($1, $2)', [devKycId, scoutKycId]);
        console.log('  Deleting talent profile...');
        await (0, db_1.query)('DELETE FROM talents WHERE user_id = $1', [talentId]);
        console.log('  Deleting demo users...');
        await (0, db_1.query)('DELETE FROM users WHERE id IN ($1, $2, $3)', [recruiterId, talentId, scoutId]);
        console.log('  Deleting organization...');
        await (0, db_1.query)('DELETE FROM organizations WHERE id = $1', [orgId]);
        await (0, db_1.query)('COMMIT');
        console.log('✅ Demo reset completed successfully!');
    }
    catch (err) {
        await (0, db_1.query)('ROLLBACK');
        console.error('❌ Reset failed:', err);
    }
    finally {
        await db_1.pool.end();
    }
}
reset();
//# sourceMappingURL=demo-reset.js.map