import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module.js';
async function bootstrap() {
    const app = await NestFactory.create(AppModule);
    const config = app.get(ConfigService);
    app.setGlobalPrefix('api');
    app.enableCors({ origin: config.get('CORS_ORIGIN', { infer: true }) });
    app.enableShutdownHooks();
    await app.listen(config.get('PORT', { infer: true }));
}
await bootstrap();
//# sourceMappingURL=main.js.map