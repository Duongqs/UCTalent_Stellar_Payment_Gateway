export interface OracleSource {
  name: string;
  fetch(): Promise<number>;
  /** Ưu tiên khi conflict (1-10, default 5). Cao hơn = ưu tiên hơn */
  priority?: number;
  /** true nếu source này là primary (CoinGecko, Vietcombank) */
  isPrimary?: boolean;
}
