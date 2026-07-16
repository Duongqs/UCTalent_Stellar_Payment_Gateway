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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DisbursementPollerService = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const stellar_1 = require("@uc/stellar");
const banking_1 = require("@uc/banking");
const core_1 = require("@uc/core");
const axios_1 = __importDefault(require("axios"));
let DisbursementPollerService = class DisbursementPollerService {
    sep31Repo;
    bankProfileRepo;
    firmQuoteRepo;
    anchorRpc;
    ninePayGateway;
    ninePayMock;
    oracleService;
    encryption;
    auditLog;
    envService;
    isPolling = false;
    constructor(sep31Repo, bankProfileRepo, firmQuoteRepo, anchorRpc, ninePayGateway, ninePayMock, oracleService, encryption, auditLog, envService) {
        this.sep31Repo = sep31Repo;
        this.bankProfileRepo = bankProfileRepo;
        this.firmQuoteRepo = firmQuoteRepo;
        this.anchorRpc = anchorRpc;
        this.ninePayGateway = ninePayGateway;
        this.ninePayMock = ninePayMock;
        this.oracleService = oracleService;
        this.encryption = encryption;
        this.auditLog = auditLog;
        this.envService = envService;
    }
    get platformUrl() {
        return (this.envService.get('PLATFORM_SERVER_URL') ||
            this.envService.get('ANCHOR_PLATFORM_URL') ||
            'http://localhost:8085');
    }
    async pollPendingTransactions() {
        if (this.isPolling)
            return;
        this.isPolling = true;
        try {
            const response = await axios_1.default.get(`${this.platformUrl}/transactions?sep=31&statuses=pending_sender,pending_receiver`, {
                timeout: 5000,
            });
            const transactions = response.data.records || [];
            for (const tx of transactions) {
                try {
                    await this.processTransaction(tx);
                }
                catch (txError) {
                    console.error(`[Disbursement Poller] Failed TX ${tx.id}:`, txError.message);
                    await this.auditLog.log(tx.id, 'poller_error', {
                        error: txError.message,
                    });
                    try {
                        await this.sep31Repo
                            .createQueryBuilder()
                            .update(core_1.Sep31TransactionEntity)
                            .set({
                            status: tx.status === 'pending_receiver'
                                ? 'pending_receiver'
                                : 'pending_sender',
                            errorMessage: txError.message,
                        })
                            .where('id = :id AND status = :status', {
                            id: tx.id,
                            status: 'processing_lock',
                        })
                            .execute();
                    }
                    catch (e) { }
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
        const platformStatus = tx.status;
        const amountIn = this.getAmountIn(tx);
        const lockResult = await this.sep31Repo
            .createQueryBuilder()
            .update(core_1.Sep31TransactionEntity)
            .set({ status: 'processing_lock' })
            .where('id = :id AND status IN (:...statuses)', {
            id: txId,
            statuses: platformStatus === 'pending_receiver'
                ? ['pending_sender', 'pending_receiver']
                : ['pending_sender'],
        })
            .execute();
        if (lockResult.affected === 0) {
            console.log(`[Disbursement Poller] Lock failed for TX ${txId}`);
            return;
        }
        console.log(`[Disbursement Poller] Processing TX ${txId}`);
        const txRecord = await this.sep31Repo.findOne({ where: { id: txId } });
        let stellarTxHash = txRecord?.stellarTxHash;
        if (platformStatus !== 'pending_receiver') {
            if (!stellarTxHash && this.shouldAutoMockOnchainPayment()) {
                stellarTxHash = this.buildMockStellarTxHash(txId);
                await this.sep31Repo.update(txId, { stellarTxHash });
                await this.auditLog.log(txId, 'mock_onchain_payment', {
                    stellar_tx_hash: stellarTxHash,
                });
            }
            if (!stellarTxHash) {
                await this.sep31Repo.update(txId, { status: 'pending_sender' });
                return;
            }
            await this.anchorRpc.notifyOnchainFundsReceived(txId, amountIn, stellarTxHash);
            await this.sep31Repo.update(txId, { status: 'pending_receiver' });
            await this.auditLog.log(txId, 'onchain_received', {
                stellar_tx_hash: stellarTxHash,
            });
        }
        else {
            await this.sep31Repo.update(txId, { status: 'pending_receiver' });
            await this.auditLog.log(txId, 'platform_pending_receiver_synced', {
                stellar_tx_hash: stellarTxHash,
            });
        }
        const receiverId = tx.customers?.receiver?.id;
        if (!receiverId) {
            await this.haltForMissingInfo(txId, 'Missing receiver customer ID on transaction');
            return;
        }
        const profile = await this.bankProfileRepo.findOne({
            where: { customerId: receiverId },
        });
        console.log(`[Disbursement Poller] Profile for ${receiverId}:`, !!profile);
        if (!profile) {
            await this.haltForMissingInfo(txId, `No bank profile for receiver ${receiverId}`);
            return;
        }
        if (!profile.isVerified) {
            await this.haltForMissingInfo(txId, `Bank profile ${profile.id} not verified`);
            return;
        }
        const bankInfo = {
            account_number: this.encryption.decrypt(profile.encryptedAccount),
            legal_name: this.encryption.decrypt(profile.encryptedName),
            bank_code: profile.bankCode,
        };
        let grossVnd;
        const actualQuoteId = tx.quote_id || txRecord?.quoteId;
        if (actualQuoteId) {
            const quote = await this.firmQuoteRepo.findOne({
                where: {
                    id: actualQuoteId,
                    usedAt: (0, typeorm_2.IsNull)(),
                    expiresAt: (0, typeorm_2.MoreThan)(new Date()),
                },
            });
            if (!quote) {
                throw new Error(`Quote ${actualQuoteId} not found, expired, or already consumed`);
            }
            quote.usedAt = new Date();
            quote.transactionId = txId;
            await this.firmQuoteRepo.save(quote);
            grossVnd = parseInt(quote.buyAmount, 10);
            await this.auditLog.log(txId, 'quote_consumed', {
                quote_id: actualQuoteId,
                gross_vnd: grossVnd,
            });
        }
        else {
            const oracle = await this.oracleService.getSafeFxRate();
            grossVnd = Math.floor(Number(amountIn) * oracle.rate);
            await this.auditLog.log(txId, 'rate_calculated', {
                rate: oracle.rate,
                method: oracle.method,
                gross_vnd: grossVnd,
            });
        }
        const taxWithheld = Math.floor(grossVnd * 0.1);
        const netVnd = grossVnd - taxWithheld;
        const taxCode = 'PIT-AFFILIATE-10%';
        const complianceMeta = {
            tax_withholding_code: taxCode,
            onshore_contract_ref: `B2B-UNCHAIN-${txId.substring(0, 8)}`,
        };
        console.log(`[Disbursement Poller] Disbursing ${netVnd} VND (Tax: ${taxWithheld}) for TX ${txId}`);
        let disburseResult;
        try {
            console.log(`[Disbursement Poller] Calling ninePayGateway.disburse...`);
            disburseResult = await this.ninePayGateway.disburse(netVnd, txId, bankInfo.bank_code, bankInfo.account_number, 'UCTalent Freelance Disbursement', bankInfo.legal_name, complianceMeta);
            if (taxWithheld > 0) {
                try {
                    const pitBankCode = this.envService.get('PIT_BANK_CODE') || 'BIDV';
                    const pitAccountNumber = this.envService.get('PIT_ACCOUNT_NUMBER') || '96311300000170179';
                    const pitAccountName = this.envService.get('PIT_ACCOUNT_NAME') || 'UCTALENT PLATFORM';
                    console.log(`[Disbursement Poller] Disbursing PIT ${taxWithheld} VND to Platform for TX ${txId}`);
                    await this.ninePayGateway.disburse(taxWithheld, `${txId}-PIT`, pitBankCode, pitAccountNumber, 'UCTalent PIT Withheld', pitAccountName, complianceMeta);
                }
                catch (pitErr) {
                    console.error(`[Disbursement Poller] PIT Disbursement failed for TX ${txId}:`, pitErr.message);
                    await this.auditLog.log(txId, 'pit_disbursement_error', {
                        error: pitErr.message,
                    });
                }
            }
        }
        catch (err) {
            if (err.message && err.message.includes('RECONCILIATION_FAILED')) {
                await this.sep31Repo.update(txId, {
                    status: 'error',
                    errorMessage: 'RECONCILIATION_FAILED',
                });
                throw err;
            }
            throw err;
        }
        const napasRef = disburseResult?.refId || disburseResult?.napasRef || `9PAY-${txId}-${Date.now()}`;
        await this.anchorRpc.notifyOffchainFundsPending(txId, napasRef);
        await this.sep31Repo.update(txId, {
            napasRefId: napasRef,
            vndAmount: netVnd,
            withheldTaxAmount: taxWithheld,
            taxCode: taxCode,
            status: 'pending_external',
        });
        await this.auditLog.log(txId, 'napas_sent', {
            napas_ref: napasRef,
            net_vnd: netVnd,
            gross_vnd: grossVnd,
            withheld_tax_amount: taxWithheld,
            tax_code: taxCode,
        });
        console.log(`[Disbursement Poller] TX ${txId} → pending_external (awaiting 9Pay IPN)`);
        if (this.envService.get('NINEPAY_MODE') === 'mock' ||
            this.envService.get('USE_MOCK_NINEPAY') === 'true' ||
            this.envService.get('USE_MOCK_IPN') === 'true') {
            await this.ninePayMock.simulateDisbursement(txId, netVnd, txId, napasRef);
            if (taxWithheld > 0) {
                await this.ninePayMock.simulateDisbursement(`${txId}-PIT`, taxWithheld, `${txId}-PIT`, napasRef);
            }
        }
    }
    async haltForMissingInfo(txId, reason) {
        console.warn(`[Disbursement Poller] HALT TX ${txId}: ${reason}`);
        await this.sep31Repo.update(txId, {
            status: 'pending_customer_info_update',
            errorMessage: reason,
        });
        await this.auditLog.log(txId, 'halted_missing_info', { reason });
    }
    getAmountIn(tx) {
        if (typeof tx.amount_in === 'string')
            return tx.amount_in;
        if (typeof tx.amount_in?.amount === 'string')
            return tx.amount_in.amount;
        if (tx.amount_expected?.amount)
            return tx.amount_expected.amount;
        return '0';
    }
    shouldAutoMockOnchainPayment() {
        return (this.envService.get('NODE_ENV') !== 'production' &&
            (this.envService.get('NINEPAY_MODE') === 'mock' ||
                this.envService.get('USE_MOCK_NINEPAY') === 'true' ||
                this.envService.get('USE_MOCK_IPN') === 'true'));
    }
    buildMockStellarTxHash(txId) {
        const txSuffix = txId.replace(/-/g, '').slice(0, 16);
        return `mock-stellar-${txSuffix}-${Date.now()}`;
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
    __param(0, (0, typeorm_1.InjectRepository)(core_1.Sep31TransactionEntity)),
    __param(1, (0, typeorm_1.InjectRepository)(core_1.BankProfileEntity)),
    __param(2, (0, typeorm_1.InjectRepository)(core_1.FirmQuoteEntity)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        stellar_1.AnchorRpcService,
        banking_1.NinePayGatewayService,
        banking_1.NinePayMockService,
        banking_1.OracleService,
        core_1.EncryptionService,
        core_1.AuditLogService,
        core_1.EnvService])
], DisbursementPollerService);
//# sourceMappingURL=disbursement-poller.service.js.map