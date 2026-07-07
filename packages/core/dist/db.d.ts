import { Pool, PoolClient } from 'pg';
declare let pool: Pool;
export declare function query<T = any>(text: string, params?: any[]): Promise<T | null>;
export declare function queryAll<T = any>(text: string, params?: any[]): Promise<T[]>;
export declare function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T>;
export declare function checkHealth(): Promise<{
    status: string;
    latency_ms: number;
}>;
export declare function auditLog(transactionId: string, eventType: string, payload: Record<string, any>): Promise<void>;
export default pool;
export { pool };
