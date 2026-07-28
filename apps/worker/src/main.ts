process.env.TZ = 'UTC';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  console.log('[Worker] Standalone Background Daemon initialized');
  app.enableShutdownHooks();
}
bootstrap();
