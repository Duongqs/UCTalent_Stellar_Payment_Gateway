import { IsString, IsNotEmpty } from 'class-validator';

export class IpnDto {
  @IsString()
  @IsNotEmpty()
  result!: string;

  @IsString()
  @IsNotEmpty()
  checksum!: string;
}
