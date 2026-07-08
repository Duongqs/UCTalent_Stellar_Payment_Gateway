import { IsString, IsNotEmpty } from 'class-validator';

export class BankVaultInquiryDto {
  @IsString()
  @IsNotEmpty()
  bankCode: string;

  @IsString()
  @IsNotEmpty()
  accountNumber: string;
}
