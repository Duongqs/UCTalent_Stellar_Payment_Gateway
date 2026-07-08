import { IsString, IsOptional } from 'class-validator';

export class GetCustomerDto {
  @IsString()
  @IsOptional()
  id?: string;

  @IsString()
  @IsOptional()
  account?: string;

  @IsString()
  @IsOptional()
  type?: string;
}
