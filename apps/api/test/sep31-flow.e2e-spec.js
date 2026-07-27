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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
process.env.NODE_ENV = 'test';
const testing_1 = require("@nestjs/testing");
const supertest_1 = __importDefault(require("supertest"));
const app_module_1 = require("../src/app.module");
const banking_1 = require("@uc/banking");
const stellar_1 = require("@uc/stellar");
const typeorm_1 = require("@nestjs/typeorm");
const core_1 = require("@uc/core");
const crypto = __importStar(require("crypto"));
function mockIpnBody(payload) {
    const resultB64 = Buffer.from(JSON.stringify(payload)).toString('base64');
    const checksum = crypto
        .createHash('sha256')
        .update(resultB64 + (process.env.NINEPAY_CHECKSUM_KEY || ''))
        .digest('hex')
        .toUpperCase();
    return { result: resultB64, checksum };
}
describe('E2E Flow Tests', () => {
    let app;
    let mockNinePayGateway;
    let mockOracleService;
    let mockSep31Service;
    let mockAnchorRpc;
    let mockSep9Validation;
    let customerRepo;
    let bankProfileRepo;
    let sep31Repo;
    let encryption;
    beforeAll(async () => {
        process.env.NODE_ENV = 'test';
        process.env.ENCRYPTION_SECRET =
            'a_very_secure_secret_key_that_is_at_least_32_bytes_long!';
        process.env.NINEPAY_CHECKSUM_KEY = 'test-key';
        mockNinePayGateway = {
            lookupAccount: jest.fn(),
            disburse: jest.fn(),
        };
        mockOracleService = {
            getSafeFxRate: jest.fn(),
            invalidateCache: jest.fn(),
            getCircuitBreakerState: jest.fn().mockReturnValue('CLOSED'),
            resetCircuitBreaker: jest.fn(),
        };
        mockSep31Service = {
            createTransaction: jest.fn(),
        };
        mockAnchorRpc = {
            notifyOnchainFundsReceived: jest.fn(),
            notifyOffchainFundsPending: jest.fn(),
            notifyOffchainFundsAvailable: jest.fn(),
            notifyTransactionError: jest.fn(),
            patchTransaction: jest.fn(),
        };
        mockSep9Validation = {
            validate: jest.fn(),
        };
        const moduleFixture = await testing_1.Test.createTestingModule({
            imports: [app_module_1.AppModule],
        })
            .overrideProvider(banking_1.NinePayGatewayService)
            .useValue(mockNinePayGateway)
            .overrideProvider(banking_1.OracleService)
            .useValue(mockOracleService)
            .overrideProvider(stellar_1.Sep31TransactionService)
            .useValue(mockSep31Service)
            .overrideProvider(stellar_1.AnchorRpcService)
            .useValue(mockAnchorRpc)
            .overrideProvider(core_1.Sep9ValidationService)
            .useValue(mockSep9Validation)
            .overrideGuard(require('../src/auth/guards/sep10.guard').Sep10Guard)
            .useValue({ canActivate: () => true })
            .compile();
        app = moduleFixture.createNestApplication();
        app.setGlobalPrefix('api');
        await app.init();
        customerRepo = moduleFixture.get((0, typeorm_1.getRepositoryToken)(core_1.CustomerEntity));
        bankProfileRepo = moduleFixture.get((0, typeorm_1.getRepositoryToken)(core_1.BankProfileEntity));
        sep31Repo = moduleFixture.get((0, typeorm_1.getRepositoryToken)(core_1.Sep31TransactionEntity));
        encryption = moduleFixture.get(core_1.EncryptionService);
    });
    afterAll(async () => {
        await app.close();
    });
    beforeEach(async () => {
        jest.clearAllMocks();
        await customerRepo.clear();
        await bankProfileRepo.clear();
        await sep31Repo.clear();
    });
    describe('Customer KYC Controller', () => {
        it('GET /customer unknown id → NEEDS_INFO', async () => {
            const res = await (0, supertest_1.default)(app.getHttpServer()).get('/api/customer?id=unknown-uuid&type=sep31-receiver');
            expect(res.status).toBe(200);
            expect(res.body.status).toBe('NEEDS_INFO');
            expect(res.body.fields).toHaveProperty('first_name');
        });
        it('PUT /customer creates or updates KYC', async () => {
            mockSep9Validation.validate.mockReturnValue({
                isValid: true,
                errors: [],
            });
            const res = await (0, supertest_1.default)(app.getHttpServer()).put('/api/customer').send({
                id: 'new-cust-uuid',
                first_name: 'A',
                last_name: 'B',
                email_address: 'a@b.c',
                id_number: '12345',
                id_country: 'VNM',
                type: 'sep31-receiver',
            });
            expect(res.status).toBe(202);
            expect(res.body.id).toBe('new-cust-uuid');
        });
        it('PUT /customer rejects invalid inputs', async () => {
            mockSep9Validation.validate.mockReturnValue({
                isValid: false,
                errors: ["Field 'firstName' must be snake_case."],
            });
            const res = await (0, supertest_1.default)(app.getHttpServer()).put('/api/customer').send({
                firstName: 'A',
                type: 'sep31-receiver',
            });
            expect(res.status).toBe(400);
        });
    });
    describe('Prices Controller', () => {
        it('GET /prices calculates rate correctly', async () => {
            mockOracleService.getSafeFxRate.mockResolvedValue({
                rate: 25400,
                rawRates: { mock: 25400 },
                usedSources: ['mock'],
                droppedSources: [],
                cachedAt: new Date(),
                method: 'single',
            });
            const res = await (0, supertest_1.default)(app.getHttpServer()).get('/api/prices?sell_asset=stellar:USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5&buy_asset=iso4217:VND&sell_amount=10');
            expect(res.status).toBe(200);
            expect(res.body.buy_assets).toBeDefined();
            expect(res.body.buy_assets[0].price).toBe('0.0000393701');
            expect(res.body.buy_assets[0].asset).toBe('iso4217:VND');
        });
    });
    describe('Bank Vault Controller', () => {
        it('POST /api/v1/bank-vault/inquiry lookup account', async () => {
            mockNinePayGateway.lookupAccount.mockResolvedValue('NGUYEN VAN A');
            const res = await (0, supertest_1.default)(app.getHttpServer())
                .post('/api/v1/bank-vault/inquiry')
                .set('x-uctalent-signature', 'bypass')
                .send({
                bankCode: '970436',
                accountNumber: '123456',
            });
            expect(res.status).toBe(200);
            expect(res.body.accountName).toBe('NGUYEN VAN A');
        });
    });
    describe('SEP-31 Controller', () => {
        it('POST /sep31/initiate create transaction', async () => {
            mockSep31Service.createTransaction.mockResolvedValue({
                id: 'stellar-tx-id',
                stellar_account: 'GABC',
                stellar_memo: '12345',
                stellar_memo_type: 'text',
            });
            const res = await (0, supertest_1.default)(app.getHttpServer())
                .post('/api/sep31/initiate')
                .set('x-uctalent-signature', 'bypass')
                .send({
                amount: '10',
                sender_id: 'sender-1',
                receiver_id: 'receiver-1',
            });
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.transactionId).toBe('stellar-tx-id');
        });
    });
    describe('IPN Controller', () => {
        it('POST /ipn callback triggers SUCCESS process', async () => {
            const tx = new core_1.Sep31TransactionEntity();
            tx.id = 'tx-123';
            tx.status = 'pending_external';
            tx.amountIn = '100';
            tx.assetCode = 'USDC';
            await sep31Repo.save(tx);
            const ipnPayload = mockIpnBody({
                invoice_no: 'inv-123',
                transaction_id: 'tx-123',
                external_transaction_id: 'napas-123',
                status: 'SUCCESS',
            });
            const res = await (0, supertest_1.default)(app.getHttpServer())
                .post('/api/ipn')
                .send(ipnPayload);
            expect(res.status).toBe(200);
            expect(res.body.message).toBe('Acknowledged');
            expect(mockAnchorRpc.notifyOffchainFundsAvailable).toHaveBeenCalledWith('tx-123', 'napas-123');
            const updated = await sep31Repo.findOne({ where: { id: 'tx-123' } });
            expect(updated?.status).toBe('completed');
        });
    });
    describe('Anchor Controller (Disburse & HMAC Guard)', () => {
        it('POST /anchor/disburse with invalid signature returns 401', async () => {
            await (0, supertest_1.default)(app.getHttpServer())
                .post('/api/anchor/disburse')
                .set('x-uctalent-signature', 'invalid')
                .send({ stellarTxHash: '0xmock' })
                .expect(401);
        });
        it('POST /anchor/disburse with bypass signature succeeds', async () => {
            const res = await (0, supertest_1.default)(app.getHttpServer())
                .post('/api/anchor/disburse')
                .set('x-uctalent-signature', 'bypass')
                .send({
                stellarTxHash: '0xmock_tx_hash_12345',
                stellarMemo: 'TEST_MEMO_001',
                oracleRate: 25450,
                splits: {
                    talent: { amountUsdc: 80, kycId: 'abc123' },
                    scout: { amountUsdc: 0, kycId: null },
                    platform: { amountUsdc: 20, kycId: null },
                },
            });
            expect(res.status).toBe(200);
            expect(res.body.status).toBe('processing');
            expect(res.body.disbursements).toBeDefined();
            expect(res.body.disbursements.length).toBeGreaterThan(0);
        });
    });
});
//# sourceMappingURL=sep31-flow.e2e-spec.js.map