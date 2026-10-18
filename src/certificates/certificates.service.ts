import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { ActivityEvent } from '../audit/entities/activity-event.entity';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { notifyInTransaction } from '../common/utils/notify';
import { Assignment } from '../assignments/entities/assignment.entity';
import { ConfigService } from '@nestjs/config';
import { Evaluation } from '../evaluation/entities/evaluation.entity';
import { KpiPeriod } from '../kpi/entities/kpi-period.entity';
import { KpiResult } from '../kpi/entities/kpi-result.entity';
import { Project } from '../projects/entities/project.entity';
import { RecruitmentProfile } from '../recruitment/entities/recruitment-profile.entity';
import { recruitmentRoleLabel } from '../recruitment/recruitment-roles';
import { InternshipSession } from '../sessions/entities/internship-session.entity';
import { User } from '../users/entities/user.entity';
import { isUniqueViolation } from '../common/utils/db-errors';
import {
  CERTIFICATE_POLICY_CODE,
  CERTIFICATE_POLICY_VERSION,
  evaluateCertificateEligibility,
  formatCertificateNumber,
} from './certificate-policy';
import { CertificatePdfService } from './certificate-pdf.service';
import { CertificatePolicy } from './entities/certificate-policy.entity';
import { Certificate } from './entities/certificate.entity';

export interface ActorContext {
  actorId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

const conflict = (code: string, message: string, details?: Record<string, unknown>) =>
  new ConflictException({ statusCode: 409, code, message, ...(details ? { details } : {}) });
const notFound = (code: string, message: string, details?: Record<string, unknown>) =>
  new NotFoundException({ statusCode: 404, code, message, ...(details ? { details } : {}) });

/**
 * CertificatesService (Phase 5, spec 41-54) — deterministic eligibility
 * (V-INTERN-COMPLETE v1, NO AI), concurrency-safe numbering via the
 * certificate_number_seq SEQUENCE (never count()+1), unguessable
 * verification codes, preserved revocation records and real PDF
 * generation. The DB is the source of truth — PDFs are regenerated from
 * persisted data on request (spec 53).
 */
@Injectable()
export class CertificatesService {
  constructor(
    @InjectRepository(Certificate) private readonly certificates: Repository<Certificate>,
    @InjectRepository(CertificatePolicy) private readonly policies: Repository<CertificatePolicy>,
    private readonly pdfService: CertificatePdfService,
    private readonly config: ConfigService,
    private readonly dataSource: DataSource,
  ) {}

  /** Idempotent upsert of the documented V1 policy (spec 42). */
  async ensurePolicyV1(em?: EntityManager): Promise<CertificatePolicy> {
    const repo = em ? em.getRepository(CertificatePolicy) : this.policies;
    const existing = await repo.findOne({
      where: { code: CERTIFICATE_POLICY_CODE, version: CERTIFICATE_POLICY_VERSION },
    });
    if (existing) return existing;
    try {
      return await repo.save(
        repo.create({
          code: CERTIFICATE_POLICY_CODE,
          version: CERTIFICATE_POLICY_VERSION,
          name: 'Chứng nhận hoàn thành chương trình thực tập V-Intern',
          minEvaluationScore: 70,
          minKpiScore: 70,
          requireRecruitmentPassed: true,
          requireCompletedAssignment: true,
          isActive: true,
        }),
      );
    } catch (err) {
      // Two concurrent issuers can race the policy INSERT — the UNIQUE
      // (code, version) index decides; the loser re-reads the winner's row
      // instead of surfacing a 500 (real defect found by the CI race).
      if (isUniqueViolation(err)) {
        const winner = await repo.findOne({
          where: { code: CERTIFICATE_POLICY_CODE, version: CERTIFICATE_POLICY_VERSION },
        });
        if (winner) return winner;
      }
      throw err;
    }
  }

  /** POST /certificates/issue (spec 49) — eligibility + atomic issuance. */
  async issue(input: { userId: string }, actorId: string, ctx: ActorContext): Promise<Certificate> {
    await this.ensurePolicyV1();
    const policy = await this.policies.findOne({
      where: { code: CERTIFICATE_POLICY_CODE, version: CERTIFICATE_POLICY_VERSION },
    });
    if (!policy) throw conflict('CERTIFICATE_POLICY_MISSING', 'The certificate policy is not configured.');

    try {
      return await this.dataSource.transaction(async (em) => {
        const facts = await this.loadFacts(input.userId, em);
        const eligibility = evaluateCertificateEligibility(
          {
            recruitmentPassed: facts.recruitmentPassed,
            hasCompletedAssignment: facts.hasCompletedAssignment,
            latestFinalizedEvaluationScore: facts.latestFinalizedEvaluationScore,
            latestFinalizedKpiScore: facts.latestFinalizedKpiScore,
          },
          {
            minEvaluationScore: Number(policy.minEvaluationScore),
            minKpiScore: Number(policy.minKpiScore),
            requireRecruitmentPassed: policy.requireRecruitmentPassed,
            requireCompletedAssignment: policy.requireCompletedAssignment,
          },
        );
        if (!eligibility.eligible) {
          throw conflict('CERTIFICATE_NOT_ELIGIBLE', 'The intern does not satisfy the certificate policy.', {
            reasons: eligibility.reasons.filter((r) => !r.satisfied),
          });
        }
        const duplicate = await em.getRepository(Certificate).findOne({
          where: { userId: input.userId, policyCode: policy.code, policyVersion: policy.version },
        });
        if (duplicate) {
          throw conflict('CERTIFICATE_ALREADY_ISSUED', 'A certificate for this user and policy version already exists.');
        }
        // Concurrency-safe number from the SQL Server SEQUENCE (spec 46).
        const seqRows = (await em.query(`SELECT NEXT VALUE FOR certificate_number_seq AS n`)) as Array<{ n: number }>;
        const issuedAt = new Date();
        const certificateNumber = formatCertificateNumber(Number(seqRows[0].n), issuedAt);
        const verificationCode = randomBytes(24).toString('base64url');
        const certificate = await em.save(
          em.create(Certificate, {
            certificateNumber,
            verificationCode,
            userId: input.userId,
            projectId: facts.completedAssignment?.projectId ?? null,
            sessionId: facts.completedAssignment?.sessionId ?? null,
            assignmentId: facts.completedAssignment?.id ?? null,
            evaluationId: facts.latestEvaluation?.id ?? null,
            kpiResultId: facts.latestKpiResult?.id ?? null,
            policyCode: policy.code,
            policyVersion: policy.version,
            status: 'issued',
            issuedAt,
            completedAt: facts.completedAssignment?.completedAt ?? null,
            holderNameSnapshot: (await em.getRepository(User).findOneBy({ id: input.userId }))?.displayName ?? null,
            roleLabelSnapshot: facts.profile?.selectedRole ? recruitmentRoleLabel(facts.profile.selectedRole) : null,
            projectNameSnapshot: facts.completedAssignment?.projectId ? (await em.getRepository(Project).findOneBy({ id: facts.completedAssignment.projectId }))?.name ?? null : null,
            sessionNameSnapshot: facts.completedAssignment?.sessionId ? (await em.getRepository(InternshipSession).findOneBy({ id: facts.completedAssignment.sessionId }))?.name ?? null : null,
            issuedById: actorId,
          }),
        );
        await em.insert(AuditLog, {
          actorId,
          action: 'certificate.issued',
          targetType: 'certificate',
          targetId: certificate.id,
          detail: JSON.stringify({
            certificateNumber,
            policyCode: policy.code,
            policyVersion: policy.version,
            userId: input.userId,
          }),
          ip: ctx.ip ?? null,
          userAgent: ctx.userAgent ?? null,
        });
        await em.insert(ActivityEvent, {
          actorId,
          module: 'certificate',
          action: 'issued',
          targetType: 'certificate',
          targetId: certificate.id,
          summary: 'Chứng nhận hoàn thành đã được cấp',
        });
        await notifyInTransaction(em, [input.userId], {
          type: 'certificate.issued',
          category: 'certificate',
          title: 'Chúc mừng! Bạn đã nhận chứng nhận hoàn thành',
          body: `Chứng nhận ${certificateNumber} đã được cấp. Bạn có thể tải PDF từ workspace.`,
          linkUrl: '/intern/me/certificates',
        });
        return certificate;
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        // The UNIQUE (userId, policyCode, policyVersion) index is the hard
        // concurrency guarantee (spec 70) — a losing racer gets a 409.
        throw conflict('CERTIFICATE_ALREADY_ISSUED', 'A certificate for this user and policy version already exists.');
      }
      throw err;
    }
  }

  /** POST /certificates/:id/revoke (spec 50) — REAL, preserved-record flow. */
  async revoke(id: string, reason: string, actorId: string, ctx: ActorContext): Promise<Certificate> {
    return this.dataSource.transaction(async (em) => {
      const certificate = await em
        .getRepository(Certificate)
        .createQueryBuilder('c')
        .setLock('pessimistic_write')
        .where('c.id = :id', { id })
        .getOne();
      if (!certificate) throw notFound('CERTIFICATE_NOT_FOUND', 'Certificate not found.');
      if (certificate.status === 'revoked') {
        // Idempotent-deterministic: a second revoke never corrupts the record.
        throw conflict('CERTIFICATE_ALREADY_REVOKED', 'Certificate is already revoked.', {
          revokedAt: certificate.revokedAt,
        });
      }
      certificate.status = 'revoked';
      certificate.revokedAt = new Date();
      certificate.revokedById = actorId;
      certificate.revokeReason = reason;
      await em.save(certificate);
      await em.insert(AuditLog, {
        actorId,
        action: 'certificate.revoked',
        targetType: 'certificate',
        targetId: certificate.id,
        detail: JSON.stringify({ certificateNumber: certificate.certificateNumber, reason }),
        ip: ctx.ip ?? null,
        userAgent: ctx.userAgent ?? null,
      });
      await em.insert(ActivityEvent, {
        actorId,
        module: 'certificate',
        action: 'revoked',
        targetType: 'certificate',
        targetId: certificate.id,
        summary: 'Chứng nhận đã bị thu hồi',
      });
      await notifyInTransaction(em, [certificate.userId], {
        type: 'certificate.revoked',
        category: 'certificate',
        title: 'Chứng nhận của bạn đã bị thu hồi',
        body: reason,
      });
      return certificate;
    });
  }

  /** Public verification (spec 47/48) — SAFE fields only. */
  async verifyByCode(code: string): Promise<{
    valid: boolean;
    status: 'issued' | 'revoked';
    certificateNumber: string;
    holderName: string | null;
    role: string | null;
    projectName: string | null;
    sessionName: string | null;
    completedAt: Date | null;
    issuedAt: Date;
    revokedAt?: Date;
  } | null> {
    const certificate = await this.certificates.findOne({ where: { verificationCode: code } });
    if (!certificate) return null;
    if (certificate.status === 'revoked') {
      return {
        valid: false,
        status: 'revoked',
        certificateNumber: certificate.certificateNumber,
        holderName: null,
        role: null,
        projectName: null,
        sessionName: null,
        completedAt: null,
        issuedAt: certificate.issuedAt,
        revokedAt: certificate.revokedAt ?? undefined,
      };
    }
    return {
      valid: true,
      status: 'issued',
      certificateNumber: certificate.certificateNumber,
      holderName: certificate.holderNameSnapshot,
      role: certificate.roleLabelSnapshot,
      projectName: certificate.projectNameSnapshot,
      sessionName: certificate.sessionNameSnapshot,
      completedAt: certificate.completedAt,
      issuedAt: certificate.issuedAt,
    };
  }

  async list(q: { page: number; pageSize: number; userId?: string; status?: string }) {
    const qb = this.certificates.createQueryBuilder('c').orderBy('c.issuedAt', 'DESC');
    if (q.userId) qb.andWhere('c.userId = :userId', { userId: q.userId });
    if (q.status) qb.andWhere('c.status = :status', { status: q.status });
    const [items, total] = await qb.skip((q.page - 1) * q.pageSize).take(q.pageSize).getManyAndCount();
    return { items, total };
  }

  async getById(id: string): Promise<Certificate> {
    const certificate = await this.certificates.findOne({ where: { id } });
    if (!certificate) throw notFound('CERTIFICATE_NOT_FOUND', 'Certificate not found.');
    return certificate;
  }

  /** Intern's own certificates (identity from principal). */
  async internList(userId: string): Promise<Certificate[]> {
    return this.certificates.find({ where: { userId }, order: { issuedAt: 'DESC' } });
  }

  async internGet(userId: string, id: string): Promise<Certificate> {
    const certificate = await this.certificates.findOne({ where: { id } });
    if (!certificate || certificate.userId !== userId) {
      throw notFound('CERTIFICATE_NOT_FOUND', 'Certificate not found.');
    }
    return certificate;
  }

  /** GET /certificates/:id/pdf (spec 51) — owner or certificates.view. */
  async renderPdf(id: string, principal: { userId: string; isAdmin: boolean }): Promise<{ buffer: Buffer; certificate: Certificate }> {
    const certificate = await this.certificates.findOne({ where: { id } });
    if (!certificate) throw notFound('CERTIFICATE_NOT_FOUND', 'Certificate not found.');
    if (!principal.isAdmin && certificate.userId !== principal.userId) {
      // 404-safe for foreign certificates — never leak existence (the same
      // rule as every other intern self-view in this codebase).
      throw notFound('CERTIFICATE_NOT_FOUND', 'Certificate not found.');
    }
    // Documented rule: the PDF is served for ISSUED certificates only — a
    // revoked certificate is communicated via the public verify endpoint.
    if (certificate.status === 'revoked') {
      throw conflict('CERTIFICATE_ALREADY_REVOKED', 'PDF is only available for issued certificates.', {
        revokedAt: certificate.revokedAt,
      });
    }
    const buffer = await this.pdfService.render({
      certificateNumber: certificate.certificateNumber,
      verificationCode: certificate.verificationCode,
      holderName: certificate.holderNameSnapshot ?? 'Người thực tập',
      roleLabel: certificate.roleLabelSnapshot,
      projectName: certificate.projectNameSnapshot,
      sessionName: certificate.sessionNameSnapshot,
      completedAt: certificate.completedAt,
      policyCode: certificate.policyCode,
      policyVersion: certificate.policyVersion,
      issuedAt: certificate.issuedAt,
      verifyBaseUrl: this.verifyBaseUrl(),
    });
    return { buffer, certificate };
  }

  // ─────────────────────────── internals ───────────────────────────────

  /**
   * Phase 6 (AI mentor context, spec 7): a SAFE eligibility summary for the
   * intern's own view — policy code, eligibility and unmet requirement
   * names only. Reuses the deterministic Phase-5 facts + policy function,
   * so the summary can never disagree with the authoritative issue flow.
   */
  async eligibilitySummary(
    userId: string,
  ): Promise<{ policyCode: string; eligible: boolean; unmetRequirements: string[] }> {
    const policy = await this.ensurePolicyV1();
    const facts = await this.loadFacts(userId);
    const eligibility = evaluateCertificateEligibility(
      {
        recruitmentPassed: facts.recruitmentPassed,
        hasCompletedAssignment: facts.hasCompletedAssignment,
        latestFinalizedEvaluationScore: facts.latestFinalizedEvaluationScore,
        latestFinalizedKpiScore: facts.latestFinalizedKpiScore,
      },
      {
        minEvaluationScore: Number(policy.minEvaluationScore),
        minKpiScore: Number(policy.minKpiScore),
        requireRecruitmentPassed: policy.requireRecruitmentPassed,
        requireCompletedAssignment: policy.requireCompletedAssignment,
      },
    );
    return {
      policyCode: policy.code,
      eligible: eligibility.eligible,
      unmetRequirements: eligibility.reasons.filter((r) => !r.satisfied).map((r) => r.requirement),
    };
  }

  private verifyBaseUrl(): string {
    return (
      this.config.get<string>('certificates.verifyBaseUrl') ??
      'http://localhost:8080/api/v1/certificates/verify'
    );
  }

  /** All persisted FACTS eligibility needs (spec 42) — no invented values. */
  private async loadFacts(userId: string, em: EntityManager = this.dataSource.manager) {
    const profile = await em.getRepository(RecruitmentProfile).findOne({ where: { userId } });
    const completedAssignment = await em
      .getRepository(Assignment)
      .createQueryBuilder('a')
      .where('a.internId = :userId', { userId })
      .andWhere('a.status = :status', { status: 'completed' })
      .orderBy('a.completedAt', 'DESC')
      .getOne();
    const latestEvaluation = await em
      .getRepository(Evaluation)
      .createQueryBuilder('e')
      .where('e.internId = :userId', { userId })
      .andWhere('e.status = :status', { status: 'finalized' })
      .orderBy('e.finalizedAt', 'DESC')
      .getOne();
    // Finalized KPI = result of a FINALIZED period (spec 42) — latest by
    // calculation time; insufficient_data rows never qualify (null score).
    const latestKpiResult = await em
      .getRepository(KpiResult)
      .createQueryBuilder('r')
      .innerJoin(KpiPeriod, 'p', 'p.id = r.periodId')
      .where('r.userId = :userId', { userId })
      .andWhere('r.status = :status', { status: 'calculated' })
      .andWhere('p.status = :periodStatus', { periodStatus: 'finalized' })
      .orderBy('r.calculatedAt', 'DESC')
      .getOne();
    return {
      recruitmentPassed: profile ? profile.status === 'passed' : null,
      hasCompletedAssignment: Boolean(completedAssignment),
      completedAssignment,
      profile,
      latestEvaluation,
      latestEvaluationScore: latestEvaluation ? Number(latestEvaluation.overallScore) : null,
      latestKpiResult,
      latestKpiScore: latestKpiResult ? Number(latestKpiResult.finalScore) : null,
      latestFinalizedEvaluationScore: latestEvaluation ? Number(latestEvaluation.overallScore) : null,
      latestFinalizedKpiScore: latestKpiResult ? Number(latestKpiResult.finalScore) : null,
    };
  }
}
