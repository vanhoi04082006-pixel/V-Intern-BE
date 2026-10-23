import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { AiService } from '../ai/ai.service';
import { AiInvalidResponseError } from '../ai/ai-errors';
import { aiErrorCode } from '../ai/ai-errors';
import {
  RecruitmentEvaluationData,
} from '../ai/evaluation-schema';
import { ActivityEvent } from '../audit/entities/activity-event.entity';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { Notification } from '../notifications/entities/notification.entity';
import { NotificationPreference } from '../notifications/entities/notification-preference.entity';
import { InterviewAnswer } from './entities/interview-answer.entity';
import { InterviewSession } from './entities/interview-session.entity';
import { InterviewSessionQuestion } from './entities/interview-session-question.entity';
import { RecruitmentProfile } from './entities/recruitment-profile.entity';
import { RecruitmentResult } from './entities/recruitment-result.entity';
import {
  RECRUITMENT_EVALUATION_TASK,
  RECRUITMENT_EVALUATION_PROMPT_VERSION,
  buildRecruitmentEvaluationInput,
  buildRecruitmentSystemPrompt,
} from './recruitment-prompt';
import { RecruitmentService, toResultResponse } from './recruitment.service';
import { CareerRolesService } from '../career-roles/career-roles.service';
import { calculateOverallScore, classifyRecruitmentScore, decideRecruitment } from './scoring';
import { validateRoleAwareRecruitmentEvaluation } from './recommendation-policy';

/**
 * Evaluation orchestration (Phase 4, spec 34-40/70).
 *
 * AUTHORITY: the AI provider returns component scores only. The Backend
 * validates them (strict schema), computes
 *   overall = round1(0.7*technical + 0.3*soft)
 * and decides passed/failed itself (spec 4/5/36). Provider decision fields
 * are rejected/ignored at the validator level.
 *
 * IDEMPOTENCY: `submitted → evaluating` happens under a pessimistic session
 * lock; a concurrent evaluator sees a non-submitted/failed status and exits.
 * UX_recruitment_results_sessionId is the hard DB guarantee against a
 * second RecruitmentResult (spec 40/68).
 *
 * FAILURE: provider errors NEVER invent scores and NEVER mark the candidate
 * failed (spec 39): the session goes evaluation_failed, the AI run row
 * records the error, and a controlled retry re-evaluates the SAME
 * snapshots/answers.
 */
@Injectable()
export class RecruitmentEvaluationService {
  private readonly logger = new Logger(RecruitmentEvaluationService.name);

  constructor(
    private readonly aiService: AiService,
    private readonly recruitmentService: RecruitmentService,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly careerRoles: CareerRolesService,
  ) {}

  async evaluateSession(
    sessionId: string,
    ctx: { actorId?: string | null; ip?: string | null; userAgent?: string | null },
  ): Promise<{
    status: InterviewSession['status'];
    result: ReturnType<typeof toResultResponse> | null;
    errorCode?: string;
  }> {
    // ── Step 1: claim evaluation (submitted|evaluation_failed → evaluating) ─
    const claimed = await this.dataSource.transaction(async (em) => {
      const session = await em
        .getRepository(InterviewSession)
        .createQueryBuilder('s')
        .setLock('pessimistic_write')
        .where('s.id = :id', { id: sessionId })
        .getOne();
      if (!session) return null;
      if (session.status === 'completed') {
        return { state: 'done' as const, session };
      }
      if (session.status === 'evaluating') {
        // Another evaluation is in flight — this caller exits idempotently.
        return { state: 'inflight' as const, session };
      }
      if (session.status === 'submitted' || session.status === 'evaluation_failed') {
        session.status = 'evaluating';
        session.evaluationStartedAt = new Date();
        await em.save(session);
        return { state: 'claimed' as const, session };
      }
      return { state: 'invalid' as const, session };
    });

    if (!claimed) {
      throw new ServiceUnavailableException({
        statusCode: 503,
        code: 'AI_EVALUATION_FAILED',
        message: 'Interview session missing.',
      });
    }
    if (claimed.state === 'done' || claimed.state === 'inflight') {
      const result = await this.findResult(sessionId);
      return { status: claimed.session.status, result: result ? toResultResponse(result) : null };
    }
    if (claimed.state === 'invalid') {
      throw new ServiceUnavailableException({
        statusCode: 409,
        code: 'INTERVIEW_NOT_EVALUABLE',
        message: `Session in status '${claimed.session.status}' cannot be evaluated.`,
      });
    }

    const session = claimed.session;

    // ── Step 2: build the prompt payload from SNAPSHOTS + answers ────────
    const questions = await this.dataSource
      .getRepository(InterviewSessionQuestion)
      .find({ where: { sessionId: session.id }, order: { position: 'ASC' } });
    const answers = await this.dataSource
      .getRepository(InterviewAnswer)
      .find({ where: { sessionId: session.id } });
    const answerByQuestion = new Map(answers.map((a) => [a.sessionQuestionId, a]));
    const turns: Array<{ questionId: string; prompt: string; clarificationPrompt: string | null; followUpStatus?: string; followUpPrompt?: string; followUpAnswer?: string }> = session.questionCount === 10
      ? await this.dataSource.query("SELECT questionId,prompt,clarificationPrompt,followUpStatus,followUpPrompt,followUpAnswer FROM interview_conversation_turns WHERE sessionId=@0 AND status='ready'", [session.id]) : [];
    const turnByQuestion = new Map(turns.map(t => [t.questionId.toLowerCase(), t]));
    const payloadQuestions = questions.map((q) => ({
      position: q.position,
      category: q.category,
      prompt: turnByQuestion.get(q.id.toLowerCase())?.prompt ?? q.promptSnapshot,
      clarification: turnByQuestion.get(q.id.toLowerCase())?.clarificationPrompt,
      rubric: JSON.parse(q.rubricSnapshot) as { expected: string; keywords: string[]; scoringGuide: string; phase?: string },
    }));
    const payloadAnswers = questions.map((q) => ({
      position: q.position,
      answerText: answerByQuestion.get(q.id)?.answerText ?? '',
      ...(turnByQuestion.get(q.id.toLowerCase())?.followUpStatus === 'answered' ? { followUp: {
        question: turnByQuestion.get(q.id.toLowerCase())!.followUpPrompt!,
        answer: turnByQuestion.get(q.id.toLowerCase())!.followUpAnswer!,
      } } : {}),
    }));

    const input = buildRecruitmentEvaluationInput({
      sessionId: session.id,
      roleCode: session.roleCode,
      questions: payloadQuestions,
      answers: payloadAnswers,
    });

    // ── Step 3: real AI call via the AI core (run row persisted inside) ──
    let evaluation: RecruitmentEvaluationData;
    let runId: string | null = null;
    let model: string;
    try {
      if (session.questionCount === 10 && questions.some(q => !turnByQuestion.get(q.id.toLowerCase())?.prompt)) throw new AiInvalidResponseError('Missing delivered interview evidence.');
      const catalog = (await this.careerRoles.listRecruiting()).items;
      const roleLabel = await this.careerRoles.label(session.roleCode);
      const aiResult = await this.aiService.generateStructuredWithRun<RecruitmentEvaluationData>({
        feature: RECRUITMENT_EVALUATION_TASK,
        userId: session.userId,
        resourceType: 'interview_session',
        resourceId: session.id,
        promptVersion: RECRUITMENT_EVALUATION_PROMPT_VERSION,
        request: {
          task: RECRUITMENT_EVALUATION_TASK,
          systemPrompt: buildRecruitmentSystemPrompt(session.roleCode, catalog, roleLabel),
          input: { ...input, careerCatalog: catalog.map(({ code, label, version, requiredSkills }) => ({ code, label, version, requiredSkills })) },
          schemaName: 'RecruitmentEvaluation',
          validate: (raw) => validateRoleAwareRecruitmentEvaluation(raw, { roleCode: session.roleCode, detailed: session.questionCount === 10, answers: payloadAnswers, availableRoles: catalog }),
          modelOptions: { temperature: 0.2, maxOutputTokens: 4096 },
        },
      });
      evaluation = aiResult.data;
      runId = aiResult.run.id;
      model = aiResult.result.model;
    } catch (err) {
      // spec 39: honest failure — no invented scores, no auto-fail.
      const code = aiErrorCode(err);
      await this.markEvaluationFailed(session);
      throw new ServiceUnavailableException({
        statusCode: 503,
        code,
        message:
          'The AI evaluation service is temporarily unavailable. Your answers are saved — retry the evaluation shortly.',
        ...(err instanceof AiInvalidResponseError ? { details: { reason: err.reason } } : {}),
      });
    }

    // ── Step 4: authoritative scoring + transactional persistence ────────
    const persisted = await this.persistEvaluation(session, evaluation, runId, model, ctx);
    return { status: 'completed', result: toResultResponse(persisted) };
  }

  private async findResult(sessionId: string): Promise<RecruitmentResult | null> {
    return this.dataSource.getRepository(RecruitmentResult).findOne({ where: { sessionId } });
  }

  private async markEvaluationFailed(session: InterviewSession): Promise<void> {
    await this.dataSource.transaction(async (em) => {
      const current = await em
        .getRepository(InterviewSession)
        .createQueryBuilder('s')
        .setLock('pessimistic_write')
        .where('s.id = :id', { id: session.id })
        .getOne();
      if (current && current.status === 'evaluating') {
        current.status = 'evaluation_failed';
        await em.save(current);
      }
    });
  }

  /**
   * Final transaction (spec 37/38): result row + session completed +
   * profile passed/failed + notification + audit + activity — ALL in ONE
   * transaction; a unique-violation race (double result) converges to the
   * existing row without duplicating side effects (spec 40/68).
   */
  private async persistEvaluation(
    session: InterviewSession,
    evaluation: RecruitmentEvaluationData,
    runId: string | null,
    model: string,
    ctx: { actorId?: string | null; ip?: string | null; userAgent?: string | null },
  ): Promise<RecruitmentResult> {
    // spec 4/35/36: the Backend (and only the Backend) computes these.
    const overallScore = calculateOverallScore(evaluation.technicalScore, evaluation.softSkillScore);
    const decision = decideRecruitment(overallScore);
    const outcome = classifyRecruitmentScore(overallScore);
    const evaluatedAt = new Date();

    return this.dataSource.transaction(async (em) => {
      const locked = await em
        .getRepository(InterviewSession)
        .createQueryBuilder('s')
        .setLock('pessimistic_write')
        .where('s.id = :id', { id: session.id })
        .getOne();
      if (!locked || locked.status !== 'evaluating') {
        // Lost the race to a retry — return the authoritative row.
        const existing = await this.findResult(session.id);
        if (existing) return existing;
        throw new ServiceUnavailableException({
          statusCode: 503,
          code: 'AI_EVALUATION_FAILED',
          message: 'Evaluation state changed concurrently — retry.',
        });
      }

      const profile = await em
        .getRepository(RecruitmentProfile)
        .createQueryBuilder('p')
        .setLock('pessimistic_write')
        .where('p.id = :id', { id: locked.profileId })
        .getOne();
      if (!profile) {
        throw new ServiceUnavailableException({
          statusCode: 503,
          code: 'AI_EVALUATION_FAILED',
          message: 'Recruitment profile missing for the evaluated session.',
        });
      }

      const resultRow = em.create(RecruitmentResult, {
        profileId: profile.id,
        sessionId: locked.id,
        aiRunId: runId,
        technicalScore: evaluation.technicalScore,
        softSkillScore: evaluation.softSkillScore,
        overallScore,
        decision,
        strengthsJson: JSON.stringify(evaluation.strengths),
        weaknessesJson: JSON.stringify(evaluation.weaknesses),
        criteriaJson: JSON.stringify(evaluation.criteria),
        feedback: evaluation.feedback,
        recommendedRole: evaluation.recommendedRole,
        model,
        promptVersion: RECRUITMENT_EVALUATION_PROMPT_VERSION,
        evaluatedAt,
      });
      let result: RecruitmentResult;
      try {
        result = await em.save(resultRow);
      } catch (err) {
        // Unique(sessionId) race — converge idempotently (spec 40).
        const existing = await this.findResult(locked.id);
        if (existing) return existing;
        throw err;
      }

      locked.status = 'completed';
      locked.evaluatedAt = evaluatedAt;
      await em.save(locked);

      // Profile transition (evaluation_pending → passed | failed).
      if (profile.status === 'evaluation_pending') {
        profile.status = decision;
        if (decision === 'passed' && !profile.recruitedAt) {
          profile.recruitedAt = evaluatedAt;
        }
        await em.save(profile);
      }

      // Notification (preference-aware — spec 77).
      await this.notify(em, profile.userId, outcome, session.roleCode, evaluation.recommendedRole);

      // Audit (spec 75) — resource IDs + metadata, never answer content.
      await em.insert(AuditLog, {
        actorId: ctx.actorId ?? profile.userId,
        action: 'recruitment.evaluation_completed',
        targetType: 'recruitment_result',
        targetId: result.id,
        detail: JSON.stringify({
          sessionId: locked.id,
          overallScore,
          decision,
          aiRunId: runId,
          model,
          promptVersion: RECRUITMENT_EVALUATION_PROMPT_VERSION,
        }),
        ip: ctx.ip ?? null,
        userAgent: ctx.userAgent ?? null,
      });
      await em.insert(AuditLog, {
        actorId: ctx.actorId ?? profile.userId,
        action: `recruitment.${outcome}`,
        targetType: 'recruitment_profile',
        targetId: profile.id,
        detail: JSON.stringify({ sessionId: locked.id, overallScore }),
        ip: ctx.ip ?? null,
        userAgent: ctx.userAgent ?? null,
      });

      // Activity (spec 76) — user-facing, no internal AI failure leaks.
      await em.insert(ActivityEvent, {
        actorId: profile.userId,
        module: 'recruitment',
        action: `recruitment.${outcome}`,
        targetType: 'recruitment_result',
        targetId: result.id,
        summary:
          decision === 'passed'
            ? `Phỏng vấn tuyển dụng hoàn tất — bạn đã trúng tuyển vị trí ${await this.careerRoles.label(session.roleCode)}`
            : outcome === 'role_recommended' && evaluation.recommendedRole
              ? `Phỏng vấn hoàn tất — AI đề xuất khám phá ${await this.careerRoles.label(evaluation.recommendedRole!)}`
            : outcome === 'role_recommended' ? 'Phỏng vấn hoàn tất — cần định hướng thêm, chưa có nghề thay thế đang tuyển' : 'Phỏng vấn tuyển dụng hoàn tất — kết quả chưa đạt',
      });

      this.logger.log(
        `Recruitment evaluation completed session=${locked.id} overall=${overallScore} decision=${decision}`,
      );
      return result;
    });
  }

  private async notify(
    em: EntityManager,
    userId: string,
    outcome: 'passed' | 'failed' | 'role_recommended',
    roleCode: string,
    recommendedRole: string | null,
  ): Promise<void> {
    const pref = await em.getRepository(NotificationPreference).findOne({
      where: { userId, category: 'recruitment' },
    });
    if (pref && !pref.enabled) return;
    const label = await this.careerRoles.label(roleCode);
    await em.insert(Notification, {
      userId,
      type: 'recruitment',
      title:
        outcome === 'passed'
          ? `Chúc mừng — bạn đã trúng tuyển vị trí ${label}`
          : outcome === 'role_recommended' ? recommendedRole ? 'AI đề xuất một vai trò phù hợp hơn' : 'Kết quả phỏng vấn: Cần định hướng thêm' : 'Kết quả phỏng vấn tuyển dụng: Chưa đạt',
      body:
        outcome === 'passed'
          ? `Bạn đã vượt qua vòng phỏng vấn AI cho vị trí ${label}. Hệ thống sẽ thông báo khi bạn được phân công vào đồ án.`
          : outcome === 'role_recommended' && recommendedRole
            ? `Từ câu trả lời phỏng vấn, AI đề xuất bạn khám phá ${await this.careerRoles.label(recommendedRole!)}. Xem lý do và số lượt còn lại trước khi chọn vai trò cho lần tiếp theo.`
            : outcome === 'role_recommended' ? 'Kết quả nằm trong khoảng 50–70 điểm nhưng hiện chưa có nghề thay thế đang nhận hồ sơ. Xem nhận xét và liên hệ giảng viên để được định hướng; kết quả và số lượt vẫn được giữ.' : 'Kết quả phỏng vấn lần này dưới 50 điểm. Xem phần cần cải thiện và số lượt còn lại để chuẩn bị cho lần tiếp theo.',
      linkUrl: '/intern/onboarding/result',
    });
  }
}
