import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { User } from '../users/entities/user.entity';
import { RecruitmentResult } from './entities/recruitment-result.entity';
import { RecruitmentProfile } from './entities/recruitment-profile.entity';
import {
  RECRUITMENT_MAX_ATTEMPTS_DEFAULT,
  RECRUITMENT_RETAKE_COOLDOWN_HOURS_DEFAULT,
} from './recruitment.constants';
import {
  RECRUITMENT_ROLE_CODES,
  isRecruitmentRoleCode,
  recruitmentRoleLabel,
} from './recruitment-roles';
import { computeAttemptGate } from './attempt-policy';
import { RecruitmentProfileStatus } from './recruitment-status.machine';
import { learningAssessment } from './learning-assessment';
import { PermissionsService } from '../rbac/permissions.service';

const candidateVisibility = (actor: string) => `(a.id IS NULL OR EXISTS(SELECT 1 FROM projects ownProject JOIN internship_sessions ownSession ON ownSession.id=a.sessionId
  WHERE ownProject.id=a.projectId AND (ownProject.mentorId=${actor} OR ownSession.leadInstructorId=${actor} OR EXISTS(SELECT 1 FROM session_instructors si WHERE si.sessionId=a.sessionId AND si.instructorId=${actor}))))`;

/** Public shape of GET /recruitment/me (spec 41/19). */
export interface RecruitmentMeResponse {
  status: RecruitmentProfileStatus;
  selectedRole: string | null;
  selectedRoleLabel: string | null;
  attemptNumber: number;
  attemptsRemaining: number;
  nextEligibleAt: Date | null;
  currentInterviewSessionId: string | null;
  recruitedAt: Date | null;
  result: RecruitmentResultResponse | null;
}

export interface RecruitmentResultResponse {
  id: string;
  sessionId: string;
  technicalScore: number;
  englishScore: number | null;
  softSkillScore: number;
  overallScore: number;
  decision: 'passed' | 'failed';
  strengths: string[];
  weaknesses: string[];
  criteria: Array<{ code: string; score: number; feedback: string }>;
  feedback: string;
  recommendedRole: string | null;
  model: string;
  promptVersion: string;
  evaluatedAt: Date;
  evaluationSource: 'ai' | 'instructor';
  evaluatedBy: string | null;
}

export function toResultResponse(r: RecruitmentResult): RecruitmentResultResponse {
  return {
    id: r.id,
    sessionId: r.sessionId,
    technicalScore: Number(r.technicalScore),
    englishScore: learningAssessment(r).englishScore,
    softSkillScore: Number(r.softSkillScore),
    overallScore: Number(r.overallScore),
    decision: r.decision,
    strengths: safeArray<string>(r.strengthsJson),
    weaknesses: safeArray<string>(r.weaknessesJson),
    criteria: safeArray<RecruitmentResultResponse['criteria'][number]>(r.criteriaJson),
    feedback: r.feedback,
    recommendedRole: r.recommendedRole,
    model: r.model,
    promptVersion: r.promptVersion,
    evaluatedAt: r.evaluatedAt,
    evaluationSource: r.evaluationSource ?? 'ai',
    evaluatedBy: r.evaluatedBy ?? null,
  };
}

function safeArray<T>(json: string): T[] {
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

const alreadyPassed = () =>
  new ConflictException({
    statusCode: 409,
    code: 'RECRUITMENT_ALREADY_PASSED',
    message: 'Recruitment already passed — role selection is closed.',
  });

@Injectable()
export class RecruitmentService {
  constructor(
    @InjectRepository(RecruitmentProfile)
    private readonly profiles: Repository<RecruitmentProfile>,
    @InjectRepository(RecruitmentResult) private readonly results: Repository<RecruitmentResult>,
    private readonly config: ConfigService,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly permissions: PermissionsService,
  ) {}

  /** Latest result for the profile, if any. */
  async latestResult(profileId: string): Promise<RecruitmentResult | null> {
    return (
      (
        await this.results.find({
          where: { profileId },
          order: { evaluatedAt: 'DESC', createdAt: 'DESC' },
          take: 1,
        })
      )[0] ?? null
    );
  }

  async latestFailedResultAt(profileId: string): Promise<Date | null> {
    const failed = await this.results.find({
      where: { profileId, decision: 'failed' },
      order: { evaluatedAt: 'DESC' },
      take: 1,
    });
    return failed[0]?.evaluatedAt ?? null;
  }

  /** GET /recruitment/me — current principal only (spec 41). */
  async me(userId: string): Promise<RecruitmentMeResponse> {
    const profile = await this.profiles.findOne({ where: { userId } });
    if (!profile) {
      return {
        status: 'not_started',
        selectedRole: null,
        selectedRoleLabel: null,
        attemptNumber: 0,
        attemptsRemaining: this.maxAttempts(),
        nextEligibleAt: null,
        currentInterviewSessionId: null,
        recruitedAt: null,
        result: null,
      };
    }
    const gate = computeAttemptGate(
      {
        profileStatus: profile.status,
        attemptCount: profile.attemptCount,
        lastFailedAt: await this.latestFailedResultAt(profile.id),
      },
      this.attemptConfig(),
      new Date(),
    );
    const latest = await this.latestResult(profile.id);
    return {
      status: profile.status,
      selectedRole: profile.selectedRole,
      selectedRoleLabel: profile.selectedRole
        ? recruitmentRoleLabel(profile.selectedRole)
        : null,
      attemptNumber: profile.attemptCount,
      attemptsRemaining: gate.attemptsRemaining,
      nextEligibleAt: gate.nextEligibleAt,
      currentInterviewSessionId: profile.currentInterviewSessionId,
      recruitedAt: profile.recruitedAt,
      result: latest ? toResultResponse(latest) : null,
    };
  }

  /**
   * PATCH /recruitment/me/role — select or re-select the recruitment role
   * (spec 8/46). Identity is ALWAYS the principal (never a body userId).
   */
  async selectRole(
    userId: string,
    roleCode: string,
    ctx: { actorId?: string | null; ip?: string | null; userAgent?: string | null },
  ): Promise<RecruitmentMeResponse> {
    if (!isRecruitmentRoleCode(roleCode)) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'RECRUITMENT_ROLE_REQUIRED',
        message: `role must be one of: ${RECRUITMENT_ROLE_CODES.join(', ')}`,
      });
    }
    return this.dataSource.transaction(async (em) => {
      // Serialize concurrent role selections per user.
      const profile = await this.lockOrCreateProfile(em, userId);
      if (profile.status === 'passed') {
        throw alreadyPassed();
      }
      if (profile.status === 'interview_in_progress' || profile.status === 'evaluation_pending') {
        throw new ConflictException({
          statusCode: 409,
          code: 'RECRUITMENT_ROLE_LOCKED',
          message: 'An interview is in progress — the role cannot be changed right now.',
        });
      }
      profile.selectedRole = roleCode;
      // not_started/role_selected → role_selected; failed → role_selected
      // (retake preparation). Same-role re-selection is idempotent.
      profile.status = 'role_selected';
      await em.save(profile);

      await em.insert(AuditLog, {
        actorId: ctx.actorId ?? userId,
        action: 'recruitment.role_selected',
        targetType: 'recruitment_profile',
        targetId: profile.id,
        detail: JSON.stringify({ roleCode }),
        ip: ctx.ip ?? null,
        userAgent: ctx.userAgent ?? null,
      });

      const gate = computeAttemptGate(
        {
          profileStatus: profile.status,
          attemptCount: profile.attemptCount,
          lastFailedAt: await this.latestFailedResultAt(profile.id),
        },
        this.attemptConfig(),
        new Date(),
      );
      return {
        status: profile.status,
        selectedRole: profile.selectedRole,
        selectedRoleLabel: recruitmentRoleLabel(profile.selectedRole!),
        attemptNumber: profile.attemptCount,
        attemptsRemaining: gate.attemptsRemaining,
        nextEligibleAt: gate.nextEligibleAt,
        currentInterviewSessionId: profile.currentInterviewSessionId,
        recruitedAt: profile.recruitedAt,
        result: null,
      };
    });
  }

  /** GET /recruitment/me/result — the authoritative persisted outcome. */
  async myResult(userId: string): Promise<RecruitmentResultResponse> {
    const profile = await this.profiles.findOne({ where: { userId } });
    if (!profile) {
      throw new NotFoundException({
        statusCode: 404,
        code: 'RECRUITMENT_RESULT_NOT_FOUND',
        message: 'No recruitment result exists yet.',
      });
    }
    const latest = await this.latestResult(profile.id);
    if (!latest) {
      throw new NotFoundException({
        statusCode: 404,
        code: 'RECRUITMENT_RESULT_NOT_FOUND',
        message: 'No recruitment result exists yet.',
      });
    }
    return toResultResponse(latest);
  }

  /**
   * M4 server-side candidate search (WP-4): one JOIN query with search/role/
   * eligibility/status filters, stable sort (key, userId) and pagination.
   * Response shape is unchanged (backward compatible with plain page/pageSize).
   */
  async listCandidates(actor: string, q: { page: number; pageSize: number; search?: string; role?: string; eligibility?: string; status?: string; sort?: string }) {
    const page = q.page || 1;
    const pageSize = q.pageSize || 20;
    const clauses = [`u.status = 'active'`];
    const params: unknown[] = [];
    const param = (v: unknown) => {
      params.push(v);
      return `@${params.length - 1}`;
    };
    if (!await this.permissions.hasRole(actor, 'admin')) clauses.push(candidateVisibility(param(actor)));
    if (q.search?.trim()) {
      const like = `%${q.search.trim()}%`;
      const p = param(like);
      clauses.push(`(u.displayName LIKE ${p} OR u.email LIKE ${p})`);
    }
    if (q.role) clauses.push(`p.selectedRole = ${param(q.role)}`);
    if (q.status) clauses.push(`p.status = ${param(q.status)}`);
    if (q.eligibility === 'available') {
      clauses.push(`p.status = 'passed'`);
      clauses.push(`a.id IS NULL`);
    }
    const where = `WHERE ${clauses.join(' AND ')}`;
    const order =
      q.sort === 'name'
        ? 'ORDER BY u.displayName ASC, p.userId ASC'
        : q.sort === 'overallScore'
          ? 'ORDER BY r.overallScore DESC, p.updatedAt DESC, p.userId ASC'
          : 'ORDER BY p.updatedAt DESC, p.userId ASC';
    const from = `FROM recruitment_profiles p
      INNER JOIN users u ON u.id = p.userId
      OUTER APPLY (SELECT TOP(1) r.overallScore, r.technicalScore, r.softSkillScore, r.decision, r.evaluatedAt,r.strengthsJson,r.weaknessesJson,r.criteriaJson
        FROM recruitment_results r WHERE r.profileId = p.id ORDER BY r.evaluatedAt DESC) r
      LEFT JOIN assignments a ON a.internId = p.userId AND a.status = 'active'`;
    const totalRows: { n: number }[] = await this.dataSource.query(
      `SELECT COUNT(*) AS n ${from} ${where}`, params,
    );
    const total = Number(totalRows[0]?.n ?? 0);
    const rows: Array<{
      userId: string; displayName: string | null; email: string | null; status: string;
      selectedRole: string | null; attemptCount: number; recruitedAt: Date | null;
      overallScore: number | null; technicalScore: number | null; softSkillScore: number | null;
      decision: string | null; evaluatedAt: Date | null;
      activeAssignmentId: string | null; activeProjectId: string | null;
      strengthsJson: string | null; weaknessesJson: string | null; criteriaJson: string | null;
    }> = await this.dataSource.query(
      `SELECT p.userId AS userId, u.displayName AS displayName, u.email AS email,
        p.status AS status, p.selectedRole AS selectedRole, p.attemptCount AS attemptCount, p.recruitedAt AS recruitedAt,
        r.overallScore AS overallScore, r.technicalScore AS technicalScore, r.softSkillScore AS softSkillScore,
        r.decision AS decision, r.evaluatedAt AS evaluatedAt,
        r.strengthsJson,r.weaknessesJson,r.criteriaJson,
        a.id AS activeAssignmentId, a.projectId AS activeProjectId
       ${from} ${where} ${order}
       OFFSET ${(page - 1) * pageSize} ROWS FETCH NEXT ${pageSize} ROWS ONLY`,
      params,
    );
    return {
      items: rows.map((row) => ({
        userId: String(row.userId).toLowerCase(),
        displayName: row.displayName,
        email: row.email,
        status: row.status,
        selectedRole: row.selectedRole,
        attemptCount: row.attemptCount,
        recruitedAt: row.recruitedAt,
        hasActiveAssignment: row.activeAssignmentId !== null,
        activeProjectId: row.activeProjectId ? String(row.activeProjectId).toLowerCase() : null,
        result:
          row.overallScore === null || row.overallScore === undefined
            ? null
            : {
                overallScore: Number(row.overallScore),
                softSkillScore: row.softSkillScore === null ? null : Number(row.softSkillScore),
                decision: row.decision,
                evaluatedAt: row.evaluatedAt,
                ...learningAssessment(row),
              },
      })),
      total,
    };
  }

  async getCandidateProfile(targetUserId: string, actor: string): Promise<RecruitmentMeResponse & { displayName: string | null; email: string | null }> {
    if (!await this.permissions.hasRole(actor, 'admin')) {
      const allowed = await this.dataSource.query(`SELECT p.userId FROM recruitment_profiles p JOIN users u ON u.id=p.userId LEFT JOIN assignments a ON a.internId=p.userId AND a.status='active'
        WHERE p.userId=@0 AND u.status='active' AND ${candidateVisibility('@1')}`, [targetUserId, actor]);
      if (!allowed.length) throw new ForbiddenException({ code: 'CANDIDATE_SCOPE_FORBIDDEN', message: 'Ứng viên không thuộc pool chưa phân công hoặc phạm vi giảng viên quản lý.' });
    }
    const profile = await this.profiles.findOne({ where: { userId: targetUserId } });
    const user = await this.dataSource.getRepository(User).findOne({ where: { id: targetUserId } });
    if (!profile && !user) {
      throw new NotFoundException({
        statusCode: 404,
        code: 'RECRUITMENT_CANDIDATE_NOT_FOUND',
        message: 'Candidate not found.',
      });
    }
    const me = profile
      ? await this.me(targetUserId)
      : {
          status: 'not_started' as const,
          selectedRole: null,
          selectedRoleLabel: null,
          attemptNumber: 0,
          attemptsRemaining: this.maxAttempts(),
          nextEligibleAt: null,
          currentInterviewSessionId: null,
          recruitedAt: null,
          result: null,
        };
    return { ...me, displayName: user?.displayName ?? null, email: user?.email ?? null };
  }

  private maxAttempts(): number {
    const raw = Number(this.config.get<number>('recruitment.maxAttempts', RECRUITMENT_MAX_ATTEMPTS_DEFAULT));
    return raw > 0 ? Math.floor(raw) : RECRUITMENT_MAX_ATTEMPTS_DEFAULT;
  }

  attemptConfig() {
    const max = this.maxAttempts();
    const cooldownRaw = Number(
      this.config.get<number>('recruitment.retakeCooldownHours', RECRUITMENT_RETAKE_COOLDOWN_HOURS_DEFAULT),
    );
    return {
      maxAttempts: max,
      retakeCooldownHours: cooldownRaw >= 0 ? cooldownRaw : RECRUITMENT_RETAKE_COOLDOWN_HOURS_DEFAULT,
    };
  }

  /** Lock (or create) the caller's profile row inside a transaction. */
  private async lockOrCreateProfile(em: EntityManager, userId: string): Promise<RecruitmentProfile> {
    const existing = await em
      .getRepository(RecruitmentProfile)
      .createQueryBuilder('p')
      .setLock('pessimistic_write')
      .where('p.userId = :userId', { userId })
      .getOne();
    if (existing) return existing;
    return em.save(em.create(RecruitmentProfile, { userId, status: 'not_started', attemptCount: 0 }));
  }
}
