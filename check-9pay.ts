import { NestFactory } from '@nestjs/core';
import { AppModule } from './apps/worker/src/app.module';
import { NinePayGatewayService } from '@uc/banking/services/ninepay-gateway.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const ninePayService = app.get(NinePayGatewayService);
  const result = await ninePayService.checkStatus('3665bfb28a6b4c9fbf1b0312760f8e');
  console.log('Check Status Result:', JSON.stringify(result));
  await app.close();
}
bootstrap();
