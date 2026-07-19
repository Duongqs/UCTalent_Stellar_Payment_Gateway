import { IsString, IsNotEmpty, IsOptional, IsNumber, IsObject } from 'class-validator';
import { Type } from 'class-transformer';

export class PostTransactionDto {
  @IsNotEmpty()
  @IsNumber()
  @Type(() => Number)
  amount!: number;

  @IsString()
  @IsNotEmpty()
  asset_code!: string;

  @IsString()
  @IsNotEmpty()
  funding_method!: string;

  @IsString()
  @IsOptional()
  asset_issuer?: string;

  @IsString()
  @IsOptional()
  destination_asset?: string;

  @IsString()
  @IsOptional()
  quote_id?: string;

  @IsString()
  @IsOptional()
  sender_id?: string;

  @IsString()
  @IsOptional()
  receiver_id?: string;

  @IsObject()
  @IsOptional()
  fields?: Record<string, any>;

  @IsString()
  @IsOptional()
  refund_memo?: string;

  @IsString()
  @IsOptional()
  refund_memo_type?: string;

  @IsString()
  @IsOptional()
  lang?: string;
}
