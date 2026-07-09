import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EnvService } from '../config/env.service';
import { EnvModule } from '../config/env.module';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [EnvModule],
      inject: [EnvService],
      useFactory: (envService: EnvService) => {
        const isTest = envService.get('NODE_ENV') === 'test';
        return {
          type: 'postgres',
          host: envService.get('POSTGRES_HOST'),
          port: envService.get('POSTGRES_PORT'),
          username: envService.get('POSTGRES_USER'),
          password: envService.get('POSTGRES_PASSWORD'),
          database: isTest
            ? (envService.get('POSTGRES_DB_TEST') || envService.get('POSTGRES_DB'))
            : envService.get('POSTGRES_DB'),
          autoLoadEntities: true,
          synchronize: isTest,
          dropSchema: isTest,
          logging: envService.get('NODE_ENV') === 'local' ? ['error', 'warn'] : false,
        };
      },
    }),
  ],
})
export class DatabaseModule {}
