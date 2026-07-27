import { Injectable } from '@nestjs/common';
import { OracleSource } from './oracle-source.interface';

@Injectable()
export class OracleSourceRegistry {
  private sources: OracleSource[] = [];

  register(source: OracleSource): void {
    this.sources.push(source);
  }

  registerAll(sources: OracleSource[]): void {
    this.sources.push(...sources);
  }

  getSources(): OracleSource[] {
    return [...this.sources];
  }
}
