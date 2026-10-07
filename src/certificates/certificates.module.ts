import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActivityEvent } from '../audit/entities/activity-event.entity';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { Assignment } from '../assignments/entities/assignment.entity';
import { ConfigModule } from '@nestjs/config';
import { Evaluation } from '../evaluation/entities/evaluation.entity';
import { KpiModule } from '../kpi/kpi.module';
import { KpiPeriod } from '../kpi/entities/kpi-period.entity';
import { KpiResult } from '../kpi/entities/kpi-result.entity';
import { Notification } from '../notifications/entities/notification.entity';
import { NotificationPreference } from '../notifications/entities/notification-preference.entity';
import { Project } from '../projects/entities/project.entity';
import { RecruitmentModule } from '../recruitment/recruitment.module';
import { RecruitmentProfile } from '../recruitment/entities/recruitment-profile.entity';
import { RbacModule } from '../rbac/rbac.module';
import { InternshipSession } from '../sessions/entities/internship-session.entity';
import { User } from '../users/entities/user.entity';
import { CertificatePolicy } from './entities/certificate-policy.entity';
import { Certificate } from './entities/certificate.entity';
import { CertificateInternController, CertificatesController } from './certificates.controller';
import { CertificatePdfService } from './certificate-pdf.service';
import { CertificatesService } from './certificates.service';

/**
 * Phase 5 — Certificates module (spec 41-54). Consumes persisted facts
 * from Recruitment + Assignment + Evaluation + KPI (one-way flow, spec
 * 56); never mutates any of them.
 */
@Module({
  imports: [
    ConfigModule,
    RbacModule,
    KpiModule,
    RecruitmentModule,
    TypeOrmModule.forFeature([
      Certificate,
      CertificatePolicy,
      RecruitmentProfile,
      Assignment,
      Evaluation,
      KpiResult,
      KpiPeriod,
      User,
      Project,
      InternshipSession,
      AuditLog,
      ActivityEvent,
      Notification,
      NotificationPreference,
    ]),
  ],
  controllers: [CertificatesController, CertificateInternController],
  providers: [CertificatesService, CertificatePdfService],
  exports: [CertificatesService],
})
export class CertificatesModule {}
