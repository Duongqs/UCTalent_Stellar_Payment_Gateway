process.env.TZ = 'UTC';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { EnvService, SqlMigrationService } from '@uc/core';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const envService = app.get(EnvService);

  if (envService.get('AUTO_RUN_MIGRATIONS')) {
    try {
      const migrationService = app.get(SqlMigrationService);
      await migrationService.runPendingMigrations();
    } catch (error) {
      console.error('[API] Failed to run SQL migrations:', error);
      if (envService.get('NODE_ENV') === 'production') {
        process.exit(1);
      }
    }
  }

  app.enableCors();
  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('UC Cross-Border API')
    .setDescription('SEP-31 Anchor + 9Pay Disbursement Gateway')
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const port = envService.get('PORT') || 8081;
  await app.listen(port);
  console.log(
    `[API] Cross-Border NestJS API running on http://localhost:${port}`,
  );
  console.log(`[API] Swagger docs at http://localhost:${port}/api/docs`);
}
bootstrap();
