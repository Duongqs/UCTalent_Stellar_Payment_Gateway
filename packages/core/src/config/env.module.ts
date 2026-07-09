import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EnvService } from './env.service';
import { envSchema } from './env.config';
import * as path from 'path';

function validate(config: Record<string, unknown>) {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    console.error('❌ Invalid environment variables:', result.error.format());
    throw new Error('Invalid environment variables');
  }
  return result.data;
}

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      validate,
      isGlobal: true,
      envFilePath: [
        '.env.test',
        '.env',
        path.resolve(__dirname, '../../../../.env')
      ],
    }),
  ],
  providers: [EnvService],
  exports: [EnvService],
})
export class EnvModule {}
