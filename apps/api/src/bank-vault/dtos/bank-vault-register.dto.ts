import { IsString, IsNotEmpty } from 'class-validator';

export class BankVaultRegisterDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsString()
  @IsNotEmpty()
  kycId: string;

  @IsString()
  @IsNotEmpty()
  bankCode: string;

  @IsString()
  @IsNotEmpty()
  accountNumber: string;

  @IsString()
  @IsNotEmpty()
  accountName: string;
}
