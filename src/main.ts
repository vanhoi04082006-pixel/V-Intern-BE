import 'reflect-metadata';
import { Logger, ValidationPipe, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { appConfig } from './config/configuration';

async function bootstrap(): Promise<void> {
  // Fail-fast secret/config validation — BEFORE any Nest wiring.
  const config = appConfig(process.env);

  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  app.use(helmet());
  app.use(cookieParser());

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

  app.useGlobalFilters(new GlobalExceptionFilter());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('V-Intern API')
    .setDescription(
      'V-Intern NestJS backend — platform core (Phase 1) + academic core (Phase 2: classes, internship sessions, projects, transactional assignments, intern workspace). Auth: bearer JWT; refresh via HttpOnly cookie scoped to /api/v1/auth.',
    )
    .setVersion('2.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swaggerConfig));

  await app.listen(config.port);
  new Logger('Bootstrap').log(`V-Intern API listening on :${config.port} (env=${config.env}) — Swagger at /api/docs`);
}

void bootstrap();
