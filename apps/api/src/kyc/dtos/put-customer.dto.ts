import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class PutCustomerDto {
  @IsString()
  @IsOptional()
  id?: string;

  @IsString()
  @IsOptional()
  account?: string;

  @IsString()
  @IsNotEmpty()
  type: string;

  @IsString()
  @IsOptional()
  first_name?: string;

  @IsString()
  @IsOptional()
  last_name?: string;

  @IsString()
  @IsOptional()
  email_address?: string;

  @IsString()
  @IsOptional()
  id_number?: string;

  @IsString()
  @IsOptional()
  id_country?: string;

  @IsString()
  @IsOptional()
  id_type?: string;
}
