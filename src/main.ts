import 'reflect-metadata';
import { Logger, ValidationPipe, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { appConfig } from './config/configuration';

async function bootstrap(): Promise<void> {
  // Fail-fast secret/config validation — BEFORE any Nest wiring.
  const config = appConfig(process.env);

  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

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
      'V-Intern NestJS backend — platform core (Phase 1) + academic core (Phase 2) + sprint/task core (Phase 3) + recruitment & AI interview (Phase 4: gated intern lifecycle, interview sessions with backend timer authority, authoritative 70/30 backend scoring — AI provides component scores only). Phase 5 adds the deterministic instructor evaluation domain (weighted backend-computed scores, immutable finalization + revision history), the performance read model, versioned kpi-v1 periods with renormalized missing components, the ledger-based VIRTUAL salary (never real payroll), and certificates with public verification + PDF. Auth: bearer JWT; refresh via HttpOnly cookie scoped to /api/v1/auth.',
    )
    .setVersion('2.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swaggerConfig));

  await app.listen(config.port);
  new Logger('Bootstrap').log(`V-Intern API listening on :${config.port} (env=${config.env}) — Swagger at /api/docs`);
}

void bootstrap();
