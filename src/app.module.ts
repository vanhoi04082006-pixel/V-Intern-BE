import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { appConfig } from './config/configuration';
import { ENTITIES } from './database/entities';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { CatalogsModule } from './catalogs/catalogs.module';
import { GroupsModule } from './groups/groups.module';
import { HealthModule } from './health/health.module';
import { NotificationsModule } from './notifications/notifications.module';
import { RbacModule } from './rbac/rbac.module';
import { SettingsModule } from './settings/settings.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [() => appConfig(process.env)] }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (cs: ConfigService) => [
        { ttl: 60_000, limit: Number(cs.get<string>('THROTTLE_LIMIT_PER_MIN', '100')) },
      ],
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (cs: ConfigService) => ({
        type: 'mssql' as const,
        host: cs.get<string>('DB_HOST', 'localhost'),
        port: Number(cs.get<string>('DB_PORT', '1433')),
        database: cs.get<string>('DB_NAME', 'VIntern'),
        username: cs.get<string>('DB_USERNAME', 'vintern_app'),
        password: cs.get<string>('DB_PASSWORD', ''),
        options: {
          encrypt: cs.get<boolean>('DB_ENCRYPT', false),
          trustServerCertificate: cs.get<boolean>('DB_TRUST_SERVER_CERTIFICATE', true),
        },
        entities: ENTITIES,
        // Migrations are the ONLY schema mechanism (production-safe).
        synchronize: false,
        migrationsRun: false,
        logging: false,
        requestTimeout: 15_000,
      }),
    }),
    AuthModule,
    UsersModule,
    RbacModule,
    GroupsModule,
    CatalogsModule,
    SettingsModule,
    AuditModule,
    NotificationsModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
