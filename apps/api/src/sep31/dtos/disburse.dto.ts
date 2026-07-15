import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsObject,
} from 'class-validator';

export class DisburseDto {
  @IsString()
  @IsNotEmpty()
  stellarTxHash: string;

  @IsString()
  @IsNotEmpty()
  stellarMemo: string;

  @IsNumber()
  @IsOptional()
  oracleRate?: number;

  @IsObject()
  splits: Record<string, { amountUsdc: number; kycId?: string | null; distributionId?: string | null }>;

  @IsString()
  @IsOptional()
  recipient?: string;
}
