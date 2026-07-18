import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class PostAuthDto {
  @ApiProperty({ description: 'The base64 encoded challenge transaction signed by the client' })
  @IsString()
  @IsNotEmpty()
  transaction: string;
}
