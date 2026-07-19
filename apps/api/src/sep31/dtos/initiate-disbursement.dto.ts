import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class InitiateDisbursementDto {
  @IsString()
  @IsNotEmpty()
  amount!: string;

  @IsString()
  @IsNotEmpty()
  sender_id!: string;

  @IsString()
  @IsNotEmpty()
  receiver_id!: string;

  @IsString()
  @IsOptional()
  quote_id?: string;

  @IsString()
  @IsOptional()
  idempotency_key?: string;

  @IsString()
  @IsOptional()
  distribution_id?: string;
}
