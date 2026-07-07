"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DisbursementPollerService = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const stellar_1 = require("@uc/stellar");
const banking_1 = require("@uc/banking");
const core_1 = require("@uc/core");
const axios_1 = __importDefault(require("axios"));
let DisbursementPollerService = class DisbursementPollerService {
    anchorRpc;
    ninePayGateway;
    ninePayMock;
    oracleService;
    platformUrl = process.env.ANCHOR_PLATFORM_URL || process.env.PLATFORM_SERVER_URL || 'http://localhost:8085';
    isPolling = false;
    constructor(anchorRpc, ninePayGateway, ninePayMock, oracleService) {
        this.anchorRpc = anchorRpc;
        this.ninePayGateway = ninePayGateway;
        this.ninePayMock = ninePayMock;
        this.oracleService = oracleService;
    }
    async pollPendingTransactions() {
        if (this.isPolling)
            return;
        this.isPolling = true;
        try {
            const response = await axios_1.default.get(`${this.platformUrl}/transactions?sep=31&statuses=pending_sender`, {
                timeout: 5000,
            });
            const transactions = response.data.records || [];
            for (const tx of transactions) {
                try {
                    await this.processTransaction(tx);
                }
                catch (txError) {
                    console.error(`[Disbursement Poller] Failed TX ${tx.id}:`, txError.message);
                    await (0, core_1.auditLog)(tx.id, 'poller_error', { error: txError.message });
                    await (0, core_1.query)(`UPDATE sep31_transactions 
             SET status = 'pending_sender', error_message = $2, updated_at = now() 
             WHERE id = $1 AND status = 'processing_lock'`, [tx.id, txError.message]).catch(() => { });
                }
            }
        }
        catch (error) {
            if (error.code !== 'ECONNREFUSED') {
                console.error('[Disbursement Poller] Poll error:', error.message);
            }
        }
        finally {
            this.isPolling = false;
        }
    }
    async processTransaction(tx) {
        const txId = tx.id;
        const lockResult = await (0, core_1.query)(`UPDATE sep31_transactions 
       SET status = 'processing_lock', updated_at = now()
       WHERE id = $1 AND status = 'pending_sender'
       RETURNING id`, [txId]);
        if (!lockResult)
            return;
        console.log(`[Disbursement Poller] Processing TX ${txId}`);
        const txRecord = await (0, core_1.query)('SELECT stellar_tx_hash FROM sep31_transactions WHERE id = $1', [txId]);
        const stellarTxHash = txRecord?.stellar_tx_hash;
        if (!stellarTxHash) {
            await (0, core_1.query)("UPDATE sep31_transactions SET status = 'pending_sender' WHERE id = $1", [txId]);
            return;
        }
        await this.anchorRpc.notifyOnchainFundsReceived(txId, tx.amount_in, stellarTxHash);
        await (0, core_1.query)(`UPDATE sep31_transactions SET status = 'pending_receiver', updated_at = now() WHERE id = $1`, [txId]);
        await (0, core_1.auditLog)(txId, 'onchain_received', { stellar_tx_hash: stellarTxHash });
        const receiverId = tx.customers?.receiver?.id;
        if (!receiverId) {
            await this.haltForMissingInfo(txId, 'Missing receiver customer ID on transaction');
            return;
        }
        const profile = await core_1.BankProfileModel.findByCustomerId(receiverId);
        if (!profile) {
            await this.haltForMissingInfo(txId, `No bank profile for receiver ${receiverId}`);
            return;
        }
        if (!profile.is_verified) {
            await this.haltForMissingInfo(txId, `Bank profile ${profile.id} not verified`);
            return;
        }
        const bankInfo = {
            account_number: (0, core_1.decrypt)(profile.encrypted_account),
            legal_name: (0, core_1.decrypt)(profile.encrypted_name),
            bank_code: profile.bank_code,
        };
        let vndAmount;
        if (tx.quote_id) {
            const quote = await (0, core_1.query)(`UPDATE firm_quotes SET used_at = now(), transaction_id = $2
         WHERE id = $1 AND used_at IS NULL AND expires_at > now()
         RETURNING *`, [tx.quote_id, txId]);
            if (!quote) {
                throw new Error(`Quote ${tx.quote_id} not found, expired, or already consumed`);
            }
            vndAmount = parseInt(quote.buy_amount);
            await (0, core_1.auditLog)(txId, 'quote_consumed', { quote_id: tx.quote_id, vnd_amount: vndAmount });
        }
        else {
            const oracle = await this.oracleService.getSafeFxRate();
            vndAmount = Math.floor(Number(tx.amount_in) * oracle.rate);
            await (0, core_1.auditLog)(txId, 'rate_calculated', { rate: oracle.rate, method: oracle.method, vnd_amount: vndAmount });
        }
        const taxWithheld = Math.floor(vndAmount * 0.1);
        const finalVndAmount = vndAmount - taxWithheld;
        const taxCode = 'PIT-AFFILIATE-10%';
        const complianceMeta = {
            tax_withholding_code: taxCode,
            onshore_contract_ref: `B2B-UNCHAIN-${txId.substring(0, 8)}`
        };
        console.log(`[Disbursement Poller] Disbursing ${finalVndAmount} VND (Tax: ${taxWithheld}) for TX ${txId}`);
        try {
            await this.ninePayGateway.disburse(finalVndAmount, txId, bankInfo.bank_code, bankInfo.account_number, 'UCTalent Freelance Disbursement', bankInfo.legal_name, complianceMeta);
        }
        catch (err) {
            if (err.message && err.message.includes('RECONCILIATION_FAILED')) {
                await (0, core_1.query)(`UPDATE sep31_transactions SET status = 'error', error_message = $2, updated_at = now() WHERE id = $1`, [txId, 'RECONCILIATION_FAILED']);
                throw err;
            }
            throw err;
        }
        const napasRef = `NAPAS-${Date.now()}`;
        await this.anchorRpc.notifyOffchainFundsPending(txId, napasRef);
        await (0, core_1.query)(`UPDATE sep31_transactions 
       SET napas_ref_id = $2, vnd_amount = $3, withheld_tax_amount = $4, tax_code = $5, status = 'pending_external', updated_at = now() 
       WHERE id = $1`, [txId, napasRef, finalVndAmount, taxWithheld, taxCode]);
        await (0, core_1.auditLog)(txId, 'napas_sent', { napas_ref: napasRef, vnd_amount: finalVndAmount, withheld_tax_amount: taxWithheld, tax_code: taxCode });
        console.log(`[Disbursement Poller] TX ${txId} → pending_external (awaiting 9Pay IPN)`);
        if (process.env.NINEPAY_MODE === 'mock' || process.env.USE_MOCK_NINEPAY === 'true' || process.env.USE_MOCK_IPN === 'true') {
            await this.ninePayMock.simulateDisbursement(txId, finalVndAmount, txId, napasRef);
        }
    }
    async haltForMissingInfo(txId, reason) {
        console.warn(`[Disbursement Poller] HALT TX ${txId}: ${reason}`);
        await (0, core_1.query)(`UPDATE sep31_transactions SET status = 'pending_customer_info_update', error_message = $2, updated_at = now() WHERE id = $1`, [txId, reason]);
        await (0, core_1.auditLog)(txId, 'halted_missing_info', { reason });
    }
};
exports.DisbursementPollerService = DisbursementPollerService;
__decorate([
    (0, schedule_1.Interval)(10000),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], DisbursementPollerService.prototype, "pollPendingTransactions", null);
exports.DisbursementPollerService = DisbursementPollerService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [stellar_1.AnchorRpcService,
        banking_1.NinePayGatewayService,
        banking_1.NinePayMockService,
        banking_1.OracleService])
], DisbursementPollerService);
//# sourceMappingURL=disbursement-poller.service.js.map