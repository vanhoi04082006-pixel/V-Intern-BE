import { GithubModule } from './github/github.module';
import { CareerRolesModule } from './career-roles/career-roles.module';
import { KnowledgeModule } from './knowledge/knowledge.module';
import { AgentsModule } from './agents/agents.module';
import { AdminSystemModule } from './admin/admin-system.module';
import { SharingModule } from './sharing/sharing.module';
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { SubmissionsModule } from './submissions/submissions.module';
import { TemplatesModule } from './templates/templates.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import cookieParser from 'cookie-parser';
import { appConfig } from './config/configuration';
import { ENTITIES } from './database/entities';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { AuditModule } from './audit/audit.module';
import { AssignmentsModule } from './assignments/assignments.module';
import { AuthModule } from './auth/auth.module';
import { CatalogsModule } from './catalogs/catalogs.module';
import { ClassesModule } from './classes/classes.module';
import { GroupsModule } from './groups/groups.module';
import { HealthModule } from './health/health.module';
import { InternModule } from './intern/intern.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ProjectsModule } from './projects/projects.module';
import { AiModule } from './ai/ai.module';
import { AiMentorModule } from './ai/mentor/ai-mentor.module';
import { EvaluationAssistanceModule } from './ai/evaluation-assistance/evaluation-assistance.module';
import { AiGenerationModule } from './ai-generation/ai-generation.module';
import { RecommendationsModule } from './ai/recommendations/recommendations.module';
import { RecruitmentModule } from './recruitment/recruitment.module';
import { RbacModule } from './rbac/rbac.module';
import { SessionsModule } from './sessions/sessions.module';
import { SettingsModule } from './settings/settings.module';
import { SprintsModule } from './sprints/sprints.module';
import { TasksModule } from './tasks/tasks.module';
import { UsersModule } from './users/users.module';
import { EvaluationModule } from './evaluation/evaluation.module';
import { PerformanceModule } from './performance/performance.module';
import { KpiModule } from './kpi/kpi.module';
import { VirtualSalaryModule } from './salary/virtual-salary.module';
import { CertificatesModule } from './certificates/certificates.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { ReportsModule } from './reports/reports.module';

@Module({
  imports: [
    AdminSystemModule,
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
          useUTC: true,
          // Env vars are STRINGS — ConfigService returns them raw, and
          // mssql@11 rejects non-boolean encrypt/trustServerCertificate.
          // Convert with the same semantics as src/database/data-source.ts
          // (Phase 3.5: latent runtime bug exposed by the CI API smoke boot).
          encrypt: cs.get<string>('DB_ENCRYPT', 'false') !== 'false',
          trustServerCertificate: cs.get<string>('DB_TRUST_SERVER_CERTIFICATE', 'true') !== 'false',
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
    CareerRolesModule,
    KnowledgeModule,
    AgentsModule,
    SettingsModule,
    AuditModule,
    NotificationsModule,
    HealthModule,
    // Phase 2 — academic core
    ClassesModule,
    SessionsModule,
    ProjectsModule,
    AssignmentsModule,
    InternModule,
    // Phase 3 — sprint / task core
    SprintsModule,
    TasksModule,
    SubmissionsModule,
    TemplatesModule,
    // Phase 4 — recruitment + AI interview core
    AiModule,
    RecruitmentModule,
    // Phase 5 — evaluation + performance + KPI + virtual salary + certificates
    EvaluationModule,
    PerformanceModule,
    ReportsModule,
    SharingModule,
    GithubModule,
    KpiModule,
    VirtualSalaryModule,
    CertificatesModule,
    DashboardModule,
    // Phase 6 — AI mentor + AI evaluation assistance + AI recommendations
    // (advisory only — the deterministic domain services stay authoritative)
    AiMentorModule,
    EvaluationAssistanceModule,
    RecommendationsModule,
    AiGenerationModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    // Unified error contract lives at MODULE level so EVERY boot (production
    // main.ts AND e2e Test apps) enforces the same response shape — Phase 3.5
    // found e2e apps silently diverging when it was main.ts-only.
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
  ],
})
export class AppModule implements NestModule {
  // cookie-parser at MODULE level for the same parity reason: the refresh
  // endpoint reads req.cookies, which Express never populates by itself.
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(cookieParser()).forRoutes('*');
  }
}
