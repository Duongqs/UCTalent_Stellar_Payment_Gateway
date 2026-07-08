import { EnvService } from '@uc/core';
export interface Sep31TransactionPayload {
    amount: string;
    asset_code: string;
    sender_id: string;
    receiver_id: string;
    quote_id?: string;
}
export declare class Sep31TransactionService {
    private readonly envService;
    constructor(envService: EnvService);
    private get anchorUrl();
    private generateMockJwt;
    createTransaction(payload: Sep31TransactionPayload): Promise<any>;
}
