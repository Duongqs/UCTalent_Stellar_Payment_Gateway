import { NestFactory } from '@nestjs/core';
import { AppModule } from './apps/api/src/app.module';
import { IpnController } from './apps/api/src/ipn/ipn.controller';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const ipnController = app.get(IpnController);
  await ipnController.pollPendingExternal();
  await app.close();
}
bootstrap();
