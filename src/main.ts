import 'reflect-metadata';
import { Logger, ValidationPipe, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { appConfig } from './config/configuration';
import { normalizeBodyParserError } from './common/filters/global-exception.filter';

async function bootstrap(): Promise<void> {
  // Fail-fast secret/config validation — BEFORE any Nest wiring.
  const config = appConfig(process.env);

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
    logger: ['error', 'warn', 'log'],
  });
  app.useBodyParser('json', { limit: '1mb' });
  app.use(normalizeBodyParserError);

  app.use(helmet()); // cookie-parser + the global exception filter now live in AppModule (e2e parity)

  // CORS: explicit allowlist + credentials (wildcard + credentials is forbidden).
  app.enableCors({
    origin: config.corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // /api/v1 via global prefix + URI versioning.
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  // DTO validation: whitelist + forbid unknown + transform (spec 22).
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('V-Intern API')
    .setDescription(
      'V-INTERN learning platform: sequential recruitment chat, versioned project libraries, owned sessions, AI draft/publish, task submissions, per-user GitHub OAuth, immutable code evidence, instructor approval and consent-based read sharing. AI proposals never replace backend authorization or final instructor decisions. Includes performance, report snapshots/PDF/XLSX, KPI, virtual salary and certificate verification. Bearer JWT; rotating HttpOnly refresh cookie at /api/v1/auth.',
    )
    .setVersion('2.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swaggerConfig));

  await app.listen(config.port);
  new Logger('Bootstrap').log(`V-Intern API listening on :${config.port} (env=${config.env}) — Swagger at /api/docs`);
}

void bootstrap();
