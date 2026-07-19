import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GetAuthDto {
  @ApiProperty({ description: 'The public key of the client account' })
  @IsString()
  @IsNotEmpty()
  account!: string;

  @ApiPropertyOptional({ description: 'The memo to attach to the challenge transaction' })
  @IsOptional()
  @IsString()
  memo?: string;

  @ApiPropertyOptional({ description: 'Client domain for SEP-10 cross-domain auth' })
  @IsOptional()
  @IsString()
  client_domain?: string;
}
