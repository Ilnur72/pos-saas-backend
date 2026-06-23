import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: true,
  });
  const isProd = process.env.NODE_ENV === 'production';

  // Trust proxy (Nginx ortidagi haqiqiy IP)
  app.set('trust proxy', 1);

  // Security
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(compression());

  app.setGlobalPrefix('api/v1');

  // CORS — production'da faqat o'z domenidan
  const frontendUrls = (process.env.FRONTEND_URL ?? 'http://localhost:5174')
    .split(',')
    .map((s) => s.trim());
  app.enableCors({
    origin: frontendUrls,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());

  // Swagger faqat dev/staging'da
  if (!isProd || process.env.ENABLE_SWAGGER === 'true') {
    const config = new DocumentBuilder()
      .setTitle('Warehouse SaaS API')
      .setDescription('Multi-tenant warehouse management SaaS')
      .setVersion('1.0')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  // Graceful shutdown
  app.enableShutdownHooks();

  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port, '0.0.0.0');
  console.log(`🚀 Server running on port ${port} (${isProd ? 'production' : 'development'})`);
  console.log(`📚 CORS origins: ${frontendUrls.join(', ')}`);
}

bootstrap().catch((err) => {
  console.error('Bootstrap error:', err);
  process.exit(1);
});
