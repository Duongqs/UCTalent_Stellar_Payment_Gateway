"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const app_module_1 = require("./app.module");
const core_2 = require("@uc/core");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    const envService = app.get(core_2.EnvService);
    if (envService.get('AUTO_RUN_MIGRATIONS')) {
        try {
            const migrationService = app.get(core_2.SqlMigrationService);
            await migrationService.runPendingMigrations();
        }
        catch (error) {
            console.error('[API] Failed to run SQL migrations:', error);
            if (envService.get('NODE_ENV') === 'production') {
                process.exit(1);
            }
        }
    }
    app.enableCors();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new common_1.ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
    }));
    const swaggerConfig = new swagger_1.DocumentBuilder()
        .setTitle('UC Cross-Border API')
        .setDescription('SEP-31 Anchor + 9Pay Disbursement Gateway')
        .setVersion('1.0.0')
        .addBearerAuth()
        .build();
    const document = swagger_1.SwaggerModule.createDocument(app, swaggerConfig);
    swagger_1.SwaggerModule.setup('api/docs', app, document);
    const port = envService.get('PORT') || 8081;
    await app.listen(port);
    console.log(`[API] Cross-Border NestJS API running on http://localhost:${port}`);
    console.log(`[API] Swagger docs at http://localhost:${port}/api/docs`);
}
bootstrap();
//# sourceMappingURL=main.js.map