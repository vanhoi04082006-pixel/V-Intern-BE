import { assertCurrentQuestion } from './conversation-policy';
import {
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { AuditLog } from '../audit/entities/audit-log.entity';
import {
  INTERVIEW_ANSWER_MAX_LENGTH,
  INTERVIEW_ANSWER_MIN_LENGTH,
  INTERVIEW_QUESTION_TOTAL,
  RECRUITMENT_INTERVIEW_DURATION_MINUTES_DEFAULT,
} from './recruitment.constants';
import { InterviewAnswer } from './entities/interview-answer.entity';
import { InterviewSession } from './entities/interview-session.entity';
import { InterviewSessionQuestion } from './entities/interview-session-question.entity';
import { RecruitmentProfile } from './entities/recruitment-profile.entity';
import { InterviewQuestion } from './entities/interview-question.entity';
import {
  InterviewSessionStatus,
  canTransitionInterviewSession,
} from './interview-status.machine';
import {
  QuestionPoolInsufficientError,
  selectSessionQuestions,
} from './question-selection';
import { RecruitmentService, RecruitmentResultResponse } from './recruitment.service';
import {
  RecruitmentProfileStatus,
  canTransitionRecruitmentProfile,
} from './recruitment-status.machine';

/** Sanitized question delivery (spec 42) — rubric NEVER included. */
export interface SanitizedSessionQuestion {
  id: string;
  position: number;
  category: 'technical' | 'soft';
  difficulty: string;
  prompt: string;
  answered: boolean;
  answeredAt: Date | null;
  answerText: string | null;
}

export interface SanitizedSessionView {
  id: string;
  roleCode: string;
  status: InterviewSessionStatus;
  startedAt: Date | null;
  expiresAt: Date | null;
  submittedAt: Date | null;
  attemptNumber: number;
  questionCount: number;
  serverNow: string;
  secondsRemaining: number | null;
}

export type EvaluationFn = (
  sessionId: string,
  ctx: { actorId?: string | null; ip?: string | null; userAgent?: string | null },
) => Promise<{ status: InterviewSessionStatus; result: RecruitmentResultResponse | null; errorCode?: string }>;

const conflict = (
  code: string,
  message: string,
  details?: Record<string, unknown>,
): ConflictException =>
  new ConflictException({ statusCode: 409, code, message, ...(details ? { details } : {}) });

@Injectable()
export class InterviewService {
  constructor(
    private readonly config: ConfigService,
    private readonly recruitmentService: RecruitmentService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  /**
   * POST /recruitment/me/interviews — start (create + activate) a session.
   * ONE transaction: profile row lock → policy gate → pool check → session
   * + 8 immutable snapshots → attempt counter + audit (spec 15/19/57).
   */
  async start(
    userId: string,
    ctx: { actorId?: string | null; ip?: string | null; userAgent?: string | null },
  ): Promise<{ session: SanitizedSessionView; questions: SanitizedSessionQuestion[] }> {
    const durationMinutes = this.durationMinutes();
    return this.dataSource.transaction(async (em) => {
      // (1) Lock the profile — serializes concurrent starts (spec 57).
      const profile = await em
        .getRepository(RecruitmentProfile)
        .createQueryBuilder('p')
        .setLock('pessimistic_write')
        .where('p.userId = :userId', { userId })
        .getOne();
      if (!profile) {
        throw conflict('RECRUITMENT_ROLE_REQUIRED', 'Select a recruitment role before starting an interview.');
      }
      if (profile.status === 'passed') {
        throw conflict('RECRUITMENT_ALREADY_PASSED', 'Recruitment already passed.');
      }
      if (profile.status === 'evaluation_pending') {
        throw conflict(
          'INTERVIEW_ALREADY_IN_PROGRESS',
          'An evaluation is pending — the interview cannot be restarted.',
        );
      }
      if (!profile.selectedRole) {
        throw conflict('RECRUITMENT_ROLE_REQUIRED', 'Select a recruitment role before starting an interview.');
      }

      // (2) An ACTIVE session blocks a new one; a dead one (expired/
      // cancelled) allows a fresh attempt under the same policy.
      if (profile.currentInterviewSessionId) {
        const current = await em.getRepository(InterviewSession).findOne({
          where: { id: profile.currentInterviewSessionId },
        });
        if (current && (current.status === 'created' || current.status === 'in_progress')) {
          throw conflict('INTERVIEW_ALREADY_IN_PROGRESS', 'An interview session is already active.', {
            sessionId: current.id,
          });
        }
        if (current && current.status === 'submitted') {
          // Session awaiting evaluation (stuck state from a crash): the
          // controlled retry endpoint owns recovery — never a new attempt.
          throw conflict(
            'INTERVIEW_ALREADY_IN_PROGRESS',
            'The previous submission is still awaiting evaluation.',
            { sessionId: current.id },
          );
        }
      }

      // (3) Attempt + cooldown policy (spec 19) — under the profile lock.
      const attemptConfig = this.recruitmentService.attemptConfig();
      const lastFailedAt = await this.recruitmentService.latestFailedResultAt(profile.id);
      // attemptCount is consumed at START; the gate checks the count BEFORE
      // incrementing (attemptNumber = attemptCount + 1).
      if (profile.attemptCount >= attemptConfig.maxAttempts) {
        throw conflict('INTERVIEW_ATTEMPT_LIMIT', 'No interview attempts remaining.', {
          attemptsRemaining: 0,
          nextEligibleAt: null,
        });
      }
      if (lastFailedAt && attemptConfig.retakeCooldownHours > 0) {
        const nextEligibleAt = new Date(
          lastFailedAt.getTime() + attemptConfig.retakeCooldownHours * 3_600_000,
        );
        if (nextEligibleAt.getTime() > Date.now()) {
          throw conflict('INTERVIEW_RETAKE_COOLDOWN', 'Retake cooldown is still active.', {
            attemptsRemaining: attemptConfig.maxAttempts - profile.attemptCount,
            nextEligibleAt,
          });
        }
      }

      // (4) Server-side question selection from ACTIVE bank rows (spec 15).
      const pool = await em.getRepository(InterviewQuestion).find({
        where: { roleCode: profile.selectedRole, isActive: true },
      });
      let selected;
      try {
        selected = selectSessionQuestions(profile.selectedRole, pool);
      } catch (err) {
        if (err instanceof QuestionPoolInsufficientError) {
          throw new ServiceUnavailableException({
            statusCode: 503,
            code: err.code,
            message: 'The question pool for this role is misconfigured. Contact an administrator.',
          });
        }
        throw err;
      }

      // (5) Create + activate the session (created → in_progress machine step).
      const now = new Date();
      const expiresAt = new Date(now.getTime() + durationMinutes * 60_000);
      const session = await em.save(
        em.create(InterviewSession, {
          userId,
          profileId: profile.id,
          roleCode: profile.selectedRole,
          status: 'in_progress',
          startedAt: now,
          expiresAt,
          attemptNumber: profile.attemptCount + 1,
          questionCount: INTERVIEW_QUESTION_TOTAL,
        }),
      );

      // (6) Immutable snapshots (spec 13/15).
      for (const q of selected) {
        await em.insert(InterviewSessionQuestion, {
          sessionId: session.id,
          questionId: q.questionId,
          position: q.position,
          category: q.category,
          promptSnapshot: q.prompt,
          difficultySnapshot: q.difficulty,
          rubricSnapshot: q.rubricJson,
        });
      }

      // (7) Profile pointer + attempt counter + status transition.
      const targetProfileStatus: RecruitmentProfileStatus = 'interview_in_progress';
      if (
        profile.status !== targetProfileStatus &&
        !canTransitionRecruitmentProfile(profile.status, targetProfileStatus)
      ) {
        throw conflict(
          'INVALID_RECRUITMENT_TRANSITION',
          `Recruitment profile cannot move from '${profile.status}' to '${targetProfileStatus}'.`,
        );
      }
      profile.status = targetProfileStatus;
      profile.currentInterviewSessionId = session.id;
      profile.attemptCount += 1;
      await em.save(profile);

      // (8) Audit (spec 75).
      await em.insert(AuditLog, {
        actorId: ctx.actorId ?? userId,
        action: 'interview.started',
        targetType: 'interview_session',
        targetId: session.id,
        detail: JSON.stringify({
          roleCode: session.roleCode,
          attemptNumber: session.attemptNumber,
          expiresAt: expiresAt.toISOString(),
        }),
        ip: ctx.ip ?? null,
        userAgent: ctx.userAgent ?? null,
      });

      const questions = await this.loadSanitizedQuestions(em, session, userId);
      return { session: this.toSessionView(session), questions: this.publicQuestions(questions, session) };
    });
  }

  /** GET /recruitment/me/interviews/:id — own session only (404-safe). */
  async getOwn(userId: string, sessionId: string): Promise<SanitizedSessionView> {
    const session = await this.ownSession(userId, sessionId);
    return this.toSessionView(session);
  }

  /**
   * GET /recruitment/me/interviews/:id/questions — sanitized delivery
   * (spec 42). Also lazily expires overdue sessions (spec 17).
   */
  async getQuestions(
    userId: string,
    sessionId: string,
    internalSnapshots = false,
  ): Promise<{ session: SanitizedSessionView; questions: SanitizedSessionQuestion[] }> {
    await this.expireIfOverdue(sessionId);
    const session = await this.ownSession(userId, sessionId);
    return this.dataSource.transaction(async (em) => ({
      session: this.toSessionView(session),
      questions: this.publicQuestions(await this.loadSanitizedQuestions(em, session, userId), session, internalSnapshots),
    }));
  }

  /**
   * PUT /recruitment/me/interviews/:id/answers/:questionId (spec 16/17/43).
   * Identity from principal; questionId MUST belong to the session.
   */
  async saveAnswer(
    userId: string,
    sessionId: string,
    sessionQuestionId: string,
    answerText: string,
  ): Promise<{ id: string; sessionQuestionId: string; answeredAt: Date }> {
    const trimmed = answerText.trim();
    if (trimmed.length < INTERVIEW_ANSWER_MIN_LENGTH || trimmed.length > INTERVIEW_ANSWER_MAX_LENGTH) {
      throw conflict(
        'INTERVIEW_ANSWER_INVALID',
        `answerText must be between ${INTERVIEW_ANSWER_MIN_LENGTH} and ${INTERVIEW_ANSWER_MAX_LENGTH} characters.`,
      );
    }
    await this.expireIfOverdue(sessionId);
    return this.dataSource.transaction(async (em) => {
      // Lock the session row — serializes answer writes + submit (spec 57).
      const session = await this.lockOwnSession(em, userId, sessionId);
      if (session.status === 'expired') {
        throw conflict('INTERVIEW_EXPIRED', 'The interview window has expired.');
      }
      if (session.status !== 'in_progress') {
        throw conflict('INTERVIEW_NOT_ACTIVE', `Interview is not active (status '${session.status}').`);
      }
      if (session.expiresAt && session.expiresAt.getTime() <= Date.now()) {
        await this.transitionSession(em, session, 'expired');
        throw conflict('INTERVIEW_EXPIRED', 'The interview window has expired.');
      }
      const question = await em.getRepository(InterviewSessionQuestion).findOne({
        where: { id: sessionQuestionId, sessionId: session.id },
      });
      if (!question) {
        throw new NotFoundException({
          statusCode: 404,
          code: 'QUESTION_NOT_IN_SESSION',
          message: 'Question is not part of this interview session.',
        });
      }
      const existing = await em.getRepository(InterviewAnswer).findOne({
        where: { sessionQuestionId: question.id },
      });
      if (session.questionCount === 10) {
        if (existing?.answerText === trimmed) return { id: existing.id, sessionQuestionId: question.id, answeredAt: existing.answeredAt };
        const questions = await em.getRepository(InterviewSessionQuestion).find({ where: { sessionId: session.id } });
        const answered = await em.getRepository(InterviewAnswer).find({ where: { sessionId: session.id, userId } });
        assertCurrentQuestion(questions, new Set(answered.map(a => a.sessionQuestionId.toLowerCase())), question.id);
        const delivered = await em.query("SELECT questionId FROM interview_conversation_turns WHERE questionId=@0 AND status='ready'", [question.id]);
        if (!delivered.length) throw conflict('INTERVIEW_QUESTION_NOT_DELIVERED', 'Chờ AI gửi câu hỏi trước khi trả lời.');
      }
      if (existing) {
        existing.answerText = trimmed;
        existing.answeredAt = new Date();
        await em.save(existing);
        return { id: existing.id, sessionQuestionId: question.id, answeredAt: existing.answeredAt };
      }
      const created = await em.save(
        em.create(InterviewAnswer, {
          sessionQuestionId: question.id,
          sessionId: session.id,
          userId,
          answerText: trimmed,
          answeredAt: new Date(),
        }),
      );
      return { id: created.id, sessionQuestionId: question.id, answeredAt: created.answeredAt };
    });
  }

  /**
   * POST /recruitment/me/interviews/:id/submit (spec 20) — idempotent.
   * Phase A (transactional): ownership/status/expiry/completeness checks,
   * in_progress → submitted + profile evaluation_pending.
   * Phase B: evaluation via RecruitmentEvaluationService (awaited in-request
   * but strictly bounded by the AI timeout — spec 27).
   */
  async submit(
    userId: string,
    sessionId: string,
    ctx: { actorId?: string | null; ip?: string | null; userAgent?: string | null },
    evaluate: EvaluationFn,
  ): Promise<{ session: SanitizedSessionView; result: RecruitmentResultResponse | null; errorCode?: string }> {
    await this.expireIfOverdue(sessionId);

    // ── Phase A: submission bookkeeping (idempotent) ─────────────────────
    await this.dataSource.transaction(async (em) => {
      const session = await this.lockOwnSession(em, userId, sessionId);
      if (session.status === 'in_progress') {
        if (session.expiresAt && session.expiresAt.getTime() <= Date.now()) {
          await this.transitionSession(em, session, 'expired');
          throw conflict('INTERVIEW_EXPIRED', 'The interview window has expired.');
        }
        // Completeness: EVERY session question answered (spec 20 step 5).
        const questions = await em.getRepository(InterviewSessionQuestion).find({
          where: { sessionId: session.id },
        });
        const answers = await em.getRepository(InterviewAnswer).find({
          where: { sessionId: session.id },
        });
        const answeredIds = new Set(answers.map((a) => a.sessionQuestionId));
        const missing = questions.filter((q) => !answeredIds.has(q.id)).length;
        if (missing > 0) {
          throw conflict('INTERVIEW_INCOMPLETE', 'All questions must be answered before submission.', {
            missingAnswers: missing,
          });
        }
        await this.transitionSession(em, session, 'submitted', new Date());
        const profile = await em.getRepository(RecruitmentProfile).findOne({
          where: { id: session.profileId },
        });
        if (profile) {
          profile.status = 'evaluation_pending';
          await em.save(profile);
        }
        await em.insert(AuditLog, {
          actorId: ctx.actorId ?? userId,
          action: 'interview.submitted',
          targetType: 'interview_session',
          targetId: session.id,
          detail: JSON.stringify({ attemptNumber: session.attemptNumber }),
          ip: ctx.ip ?? null,
          userAgent: ctx.userAgent ?? null,
        });
        return { submittedNow: true as const, session };
      }
      // Idempotent re-submit: created/… not allowed, but an already
      // submitted/evaluating/completed session returns its current state
      // (double click MUST NOT create two evaluations — spec 20/68).
      if (
        session.status === 'submitted' ||
        session.status === 'evaluating' ||
        session.status === 'completed' ||
        session.status === 'evaluation_failed'
      ) {
        return { submittedNow: false as const, session };
      }
      if (session.status === 'expired') {
        throw conflict('INTERVIEW_EXPIRED', 'The interview window has expired.');
      }
      throw conflict(
        'INTERVIEW_NOT_ACTIVE',
        `Interview cannot be submitted from status '${session.status}'.`,
      );
    });

    // ── Phase B: evaluation (own idempotency + unique result) ────────────
    const evaluation = await evaluate(sessionId, ctx);

    const session = await this.ownSession(userId, sessionId);
    return {
      session: this.toSessionView(session),
      result: evaluation.result,
      ...(evaluation.errorCode ? { errorCode: evaluation.errorCode } : {}),
    };
  }

  /**
   * POST /recruitment/me/interviews/:id/retry-evaluation (spec 39/40) —
   * allowed only from evaluation_failed; same snapshots, same answers,
   * no duplicate result (unique index + evaluating guard).
   */
  async retryEvaluation(
    userId: string,
    sessionId: string,
    ctx: { actorId?: string | null; ip?: string | null; userAgent?: string | null },
    evaluate: EvaluationFn,
  ): Promise<{ session: SanitizedSessionView; result: RecruitmentResultResponse | null; errorCode?: string }> {
    await this.dataSource.transaction(async (em) => {
      const session = await this.lockOwnSession(em, userId, sessionId);
      if (session.status !== 'evaluation_failed') {
        throw conflict(
          'INTERVIEW_NOT_RETRYABLE',
          `Evaluation retry requires status 'evaluation_failed' (got '${session.status}').`,
        );
      }
      await em.insert(AuditLog, {
        actorId: ctx.actorId ?? userId,
        action: 'evaluation.retry',
        targetType: 'interview_session',
        targetId: session.id,
        detail: null,
        ip: ctx.ip ?? null,
        userAgent: ctx.userAgent ?? null,
      });
    });
    const evaluation = await evaluate(sessionId, ctx);
    const session = await this.ownSession(userId, sessionId);
    return {
      session: this.toSessionView(session),
      result: evaluation.result,
      ...(evaluation.errorCode ? { errorCode: evaluation.errorCode } : {}),
    };
  }

  // ────────────────────────── shared internals ─────────────────────────────

  /** Pessimistic OWN-session lock; 404-safe for foreign sessions. */
  private async lockOwnSession(
    em: EntityManager,
    userId: string,
    sessionId: string,
  ) {
    const session = await em
      .getRepository(InterviewSession)
      .createQueryBuilder('s')
      .setLock('pessimistic_write')
      .where('s.id = :id AND s.userId = :userId', { id: sessionId, userId })
      .getOne();
    if (!session) {
      throw new NotFoundException({
        statusCode: 404,
        code: 'INTERVIEW_NOT_FOUND',
        message: 'Interview session not found.',
      });
    }
    return session;
  }

  private async ownSession(userId: string, sessionId: string): Promise<InterviewSession> {
    const session = await this.dataSource
      .getRepository(InterviewSession)
      .findOne({ where: { id: sessionId } });
    if (!session || session.userId !== userId) {
      // 404 for BOTH unknown and foreign sessions — never leak existence.
      throw new NotFoundException({
        statusCode: 404,
        code: 'INTERVIEW_NOT_FOUND',
        message: 'Interview session not found.',
      });
    }
    return session;
  }

  /** Machine-checked transition with timestamp side effects. */
  private async transitionSession(
    em: EntityManager,
    session: InterviewSession,
    to: InterviewSessionStatus,
    submittedAt?: Date,
  ): Promise<void> {
    if (!canTransitionInterviewSession(session.status, to)) {
      throw conflict(
        'INVALID_INTERVIEW_TRANSITION',
        `Interview cannot move from '${session.status}' to '${to}'.`,
      );
    }
    session.status = to;
    if (submittedAt) session.submittedAt = submittedAt;
    await em.save(session);
  }

  /** Lazy expiry: in_progress + past expiresAt → expired (spec 17). */
  private async expireIfOverdue(sessionId: string): Promise<void> {
    await this.dataSource.transaction(async (em) => {
      const session = await em
        .getRepository(InterviewSession)
        .createQueryBuilder('s')
        .setLock('pessimistic_write')
        .where('s.id = :id', { id: sessionId })
        .getOne();
      if (
        session &&
        session.status === 'in_progress' &&
        session.expiresAt &&
        session.expiresAt.getTime() <= Date.now()
      ) {
        session.status = 'expired';
        await em.save(session);
      }
    });
  }

  /** Sanitized question delivery (spec 42) — no rubric, ever. */
  private async loadSanitizedQuestions(
    em: EntityManager,
    session: InterviewSession,
    userId: string,
  ): Promise<SanitizedSessionQuestion[]> {
    const questions = await em.getRepository(InterviewSessionQuestion).find({
      where: { sessionId: session.id },
      order: { position: 'ASC' },
    });
    const answers = await em.getRepository(InterviewAnswer).find({
      where: { sessionId: session.id, userId },
    });
    const answeredByQuestion = new Map(answers.map((a) => [a.sessionQuestionId, a]));
    return questions.map((q) => {
      const answer = answeredByQuestion.get(q.id);
      return {
        id: q.id,
        position: q.position,
        category: q.category,
        difficulty: q.difficultySnapshot,
        prompt: q.promptSnapshot,
        answered: Boolean(answer),
        answeredAt: answer?.answeredAt ?? null,
        answerText: answer?.answerText ?? null,
      };
    });
  }

  private publicQuestions(questions: SanitizedSessionQuestion[], session: InterviewSession, internal = false): SanitizedSessionQuestion[] {
    if (internal || session.questionCount !== 10) return questions;
    return questions.filter(q => q.answered);
  }

  private toSessionView(session: InterviewSession): SanitizedSessionView {
    const now = Date.now();
    return {
      id: session.id,
      roleCode: session.roleCode,
      status: session.status,
      startedAt: session.startedAt,
      expiresAt: session.expiresAt,
      submittedAt: session.submittedAt,
      attemptNumber: session.attemptNumber,
      questionCount: session.questionCount,
      serverNow: new Date(now).toISOString(),
      secondsRemaining:
        session.expiresAt && session.status === 'in_progress'
          ? Math.max(0, Math.floor((session.expiresAt.getTime() - now) / 1000))
          : null,
    };
  }

  private durationMinutes(): number {
    const raw = Number(
      this.config.get<number>(
        'recruitment.interviewDurationMinutes',
        RECRUITMENT_INTERVIEW_DURATION_MINUTES_DEFAULT,
      ),
    );
    return raw > 0 ? raw : RECRUITMENT_INTERVIEW_DURATION_MINUTES_DEFAULT;
  }
}
