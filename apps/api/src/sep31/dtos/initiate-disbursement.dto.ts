import { IsString, IsNotEmpty, IsOptional, IsNumber } from 'class-validator';

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

  @IsString()
  @IsOptional()
  job_name?: string;

  @IsString()
  @IsOptional()
  payment_type?: string;

  @IsNumber()
  @IsOptional()
  milestone_index?: number;

  @IsString()
  @IsOptional()
  recipient_user_id?: string;
}
