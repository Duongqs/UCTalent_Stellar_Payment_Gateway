import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class BankVaultInquiryDto {
  @IsString()
  @IsNotEmpty()
  bankCode: string;

  @IsString()
  @IsNotEmpty()
  accountNumber: string;

  @IsString()
  @IsOptional()
  accountType?: string;
}
