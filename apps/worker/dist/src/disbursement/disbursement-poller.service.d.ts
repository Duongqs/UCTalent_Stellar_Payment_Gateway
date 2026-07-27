import { Repository } from 'typeorm';
import { AnchorRpcService } from '@uc/stellar';
import { NinePayGatewayService, NinePayMockService, OracleService } from '@uc/banking';
import { Sep31TransactionEntity, BankProfileEntity, FirmQuoteEntity, EncryptionService, AuditLogService, EnvService } from '@uc/core';
export declare class DisbursementPollerService {
    private readonly sep31Repo;
    private readonly bankProfileRepo;
    private readonly firmQuoteRepo;
    private readonly anchorRpc;
    private readonly ninePayGateway;
    private readonly ninePayMock;
    private readonly oracleService;
    private readonly encryption;
    private readonly auditLog;
    private readonly envService;
    private isPolling;
    constructor(sep31Repo: Repository<Sep31TransactionEntity>, bankProfileRepo: Repository<BankProfileEntity>, firmQuoteRepo: Repository<FirmQuoteEntity>, anchorRpc: AnchorRpcService, ninePayGateway: NinePayGatewayService, ninePayMock: NinePayMockService, oracleService: OracleService, encryption: EncryptionService, auditLog: AuditLogService, envService: EnvService);
    private get platformUrl();
    private getBackendRevertUrl;
    private revertPaymentDistribution;
    pollPendingTransactions(): Promise<void>;
    private processTransaction;
    private haltForMissingInfo;
    private getAmountIn;
    private shouldAutoMockOnchainPayment;
    private buildMockStellarTxHash;
}
