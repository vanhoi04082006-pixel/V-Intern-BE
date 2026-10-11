import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
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

  /** Admin/instructor candidates read (spec 44 — recruitment.view only). */
  async listCandidates(q: { page: number; pageSize: number; status?: string }) {
    const users = this.dataSource.getRepository(User);
    const qb = this.profiles
      .createQueryBuilder('p')
      .orderBy('p.updatedAt', 'DESC')
      .skip((q.page - 1) * q.pageSize)
      .take(q.pageSize);
    if (q.status) qb.andWhere('p.status = :status', { status: q.status });
    const [items, total] = await qb.getManyAndCount();
    const userIds = items.map((p) => p.userId);
    const userRows = userIds.length
      ? await users.find({ where: userIds.map((id) => ({ id })) })
      : [];
    const userById = new Map(userRows.map((u) => [u.id, u]));
    const resultRows = userIds.length
      ? await this.results
          .createQueryBuilder('r')
          .where('r.profileId IN (:...pids)', { pids: items.map((p) => p.id) })
          .orderBy('r.evaluatedAt', 'DESC')
          .getMany()
      : [];
    const latestResultByProfile = new Map<string, RecruitmentResult>();
    for (const r of resultRows) {
      if (!latestResultByProfile.has(r.profileId)) latestResultByProfile.set(r.profileId, r);
    }
    const activeRows = userIds.length
      ? await this.dataSource.query(
          `SELECT internId, projectId FROM assignments WHERE status = 'active' AND internId IN (${userIds.map((_, i) => `@${i}`).join(', ')})`,
          userIds,
        )
      : [];
    const activeByIntern = new Map((activeRows as Array<{ internId: string; projectId: string }>).map((r) => [r.internId, r.projectId]));
    return {
      items: items.map((p) => {
        const user = userById.get(p.userId);
        const result = latestResultByProfile.get(p.id);
        return {
          userId: p.userId,
          displayName: user?.displayName ?? null,
          email: user?.email ?? null,
          status: p.status,
          selectedRole: p.selectedRole,
          attemptCount: p.attemptCount,
          recruitedAt: p.recruitedAt,
          hasActiveAssignment: activeByIntern.has(p.userId),
          activeProjectId: activeByIntern.get(p.userId) ?? null,
          result: result
            ? {
                overallScore: Number(result.overallScore),
                technicalScore: Number(result.technicalScore),
                softSkillScore: Number(result.softSkillScore),
                decision: result.decision,
                evaluatedAt: result.evaluatedAt,
              }
            : null,
        };
      }),
      total,
    };
  }

  async getCandidateProfile(targetUserId: string): Promise<RecruitmentMeResponse & { displayName: string | null; email: string | null }> {
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
