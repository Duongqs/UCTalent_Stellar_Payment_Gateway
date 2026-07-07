import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  console.log('[Worker] Standalone Background Daemon initialized');
  
  // Keep-alive or handle shutdown signals
  app.enableShutdownHooks();
}
bootstrap();
