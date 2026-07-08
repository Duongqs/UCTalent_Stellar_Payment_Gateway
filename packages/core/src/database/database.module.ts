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
        if (envService.get('NODE_ENV') === 'test') {
          return {
            type: 'better-sqlite3',
            database: ':memory:',
            autoLoadEntities: true,
            synchronize: true,
            dropSchema: true,
          };
        }
        return {
          type: 'postgres',
          host: envService.get('POSTGRES_HOST'),
          port: envService.get('POSTGRES_PORT'),
          username: envService.get('POSTGRES_USER'),
          password: envService.get('POSTGRES_PASSWORD'),
          database: envService.get('POSTGRES_DB'),
          autoLoadEntities: true,
          synchronize: envService.get('NODE_ENV') !== 'production',
          logging: envService.get('NODE_ENV') === 'local' ? ['error', 'warn'] : false,
        };
      },
    }),
  ],
})
export class DatabaseModule {}
