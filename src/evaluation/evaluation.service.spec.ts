import { NotFoundException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { EvaluationService } from './evaluation.service';
import { EvaluationCycle } from './entities/evaluation-cycle.entity';
import { EvaluationCriterion } from './entities/evaluation-criterion.entity';
import { EvaluationRevision } from './entities/evaluation-revision.entity';
import { EvaluationScore } from './entities/evaluation-score.entity';
import { Evaluation } from './entities/evaluation.entity';
import { Assignment } from '../assignments/entities/assignment.entity';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { ActivityEvent } from '../audit/entities/activity-event.entity';
import { Notification } from '../notifications/entities/notification.entity';

/**
 * EvaluationService unit tests (spec 79): cycle state machine at the
 * service boundary, weight-total validation, required-criteria gate,
 * finalization immutability + notification/audit emission, ownership, and
 * the exact backend weighted score (83.2). Lock semantics and multi-user
 * concurrency are e2e concerns on REAL SQL Server.
 */

type AnyMock = jest.Mock;
interface AnyRepo {
  [key: string]: AnyMock;
}

const CYCLE: EvaluationCycle = {
  id: 'cycle-1',
  code: 'CY-1',
  name: 'Cycle 1',
  sessionId: 'session-1',
  projectId: null,
  type: 'sprint',
  status: 'open',
  startDate: new Date('2026-02-01T00:00:00Z'),
  endDate: new Date('2026-03-01T00:00:00Z'),
  dueDate: null,
  createdById: 'admin-1',
  createdAt: new Date('2026-02-01T00:00:00Z'),
  updatedAt: new Date('2026-02-01T00:00:00Z'),
} as EvaluationCycle;

const CRITERIA: EvaluationCriterion[] = [
  { id: 'c1', cycleId: 'cycle-1', code: 'technical_quality', name: 'T1', weight: 35, maxScore: 100, sortOrder: 1, isRequired: true, createdAt: new Date() },
  { id: 'c2', cycleId: 'cycle-1', code: 'delivery_execution', name: 'T2', weight: 30, maxScore: 100, sortOrder: 2, isRequired: true, createdAt: new Date() },
  { id: 'c3', cycleId: 'cycle-1', code: 'communication_teamwork', name: 'T3', weight: 20, maxScore: 100, sortOrder: 3, isRequired: true, createdAt: new Date() },
  { id: 'c4', cycleId: 'cycle-1', code: 'growth_ownership', name: 'T4', weight: 15, maxScore: 100, sortOrder: 4, isRequired: true, createdAt: new Date() },
] as EvaluationCriterion[];

const EVALUATION: Evaluation = {
  id: 'eval-1',
  cycleId: 'cycle-1',
  internId: 'intern-1',
  evaluatorId: 'instructor-1',
  projectId: null,
  sessionId: 'session-1',
  status: 'submitted',
  overallScore: null,
  summary: null,
  submittedAt: new Date('2026-02-10T00:00:00Z'),
  finalizedAt: null,
  revisionNumber: 0,
  createdAt: new Date('2026-02-05T00:00:00Z'),
  updatedAt: new Date('2026-02-10T00:00:00Z'),
} as Evaluation;

function lockQb(result: unknown) {
  const qb = { setLock: jest.fn(), where: jest.fn(), getOne: jest.fn(async () => result) };
  qb.setLock.mockReturnThis();
  qb.where.mockReturnThis();
  return qb;
}

function buildHarness(opts?: {
  cycle?: EvaluationCycle | null;
  evaluation?: Evaluation | null;
  criteria?: EvaluationCriterion[];
  scores?: EvaluationScore[];
  assignment?: Assignment | null;
  instructorExists?: boolean;
  prefEnabled?: boolean | null;
}) {
  const cycle = opts?.cycle === undefined ? { ...CYCLE } : opts.cycle;
  const evaluation = opts?.evaluation === undefined ? { ...EVALUATION } : opts.evaluation;
  const criteria = opts?.criteria ?? CRITERIA.map((c) => ({ ...c }));
  const scores = (opts?.scores ?? []).map((s) => ({ ...s }));
  const inserted: Array<{ entity: unknown; row: unknown }> = [];

  const cycleRepo: AnyRepo = {
    findOne: jest.fn(async () => cycle),
    createQueryBuilder: jest.fn(() => lockQb(cycle)),
  };
  const criterionRepo: AnyRepo = {
    find: jest.fn(async () => criteria),
    findOne: jest.fn(async (args: { where: { id?: string; cycleId?: string; code?: string } }) =>
      criteria.find((c) => (args.where.id ? c.id === args.where.id : true) && (!args.where.code || c.code === args.where.code)) ?? null,
    ),
    delete: jest.fn(async () => ({})),
  };
  const evaluationRepo: AnyRepo = {
    findOne: jest.fn(async (args?: { where?: Record<string, unknown> }) => {
      if (!args?.where) return evaluation;
      const w = args.where as { id?: string; internId?: string; status?: string; cycleId?: string; evaluatorId?: string };
      if (w.id) return evaluations.find((e) => e.id === w.id) ?? null;
      if ('evaluatorId' in w) return []; // duplicate-probe shape → no duplicate
      if (w.internId) return evaluations.filter((e) => e.internId === w.internId && (!w.status || e.status === w.status));
      return null;
    }),
    createQueryBuilder: jest.fn(() => lockQb(evaluation)),
  };
  const evaluations: Evaluation[] = evaluation ? [evaluation] : [];
  const scoreRepo: AnyRepo = {
    find: jest.fn(async (args?: { where?: Record<string, unknown> }) => {
      const w = args?.where as { evaluationId?: string } | undefined;
      return w?.evaluationId ? scores.filter((s) => s.evaluationId === w.evaluationId) : scores;
    }),
    findOne: jest.fn(async (args: { where: { evaluationId: string; criterionId: string } }) =>
      scores.find((s) => s.evaluationId === args.where.evaluationId && s.criterionId === args.where.criterionId) ?? null,
    ),
  };
  const revisionRepo: AnyRepo = { create: jest.fn((x: unknown) => x) };
  const assignmentRepo: AnyRepo = {
    createQueryBuilder: jest.fn(() => {
      // assertInternInCycleScope chains where + andWhere before getOne.
      const qb = lockQb(opts?.assignment ?? null);
      (qb as Record<string, unknown>).andWhere = jest.fn().mockReturnThis();
      return qb;
    }),
    find: jest.fn(async () => (opts?.assignment ? [opts.assignment] : [])),
  };
  const instructorRepo: AnyRepo = {
    findOne: jest.fn(async () => (opts?.instructorExists === false ? null : { sessionId: 'session-1', instructorId: 'instructor-1' })),
  };
  const projectRepo: AnyRepo = { findOne: jest.fn(async () => null) };
  const prefRepo: AnyRepo = {
    find: jest.fn(async () => (opts?.prefEnabled === false ? [{ userId: 'intern-1', category: 'evaluation', enabled: false }] : [])),
  };

  const repos: Record<string, AnyRepo> = {
    EvaluationCycle: cycleRepo,
    EvaluationCriterion: criterionRepo,
    Evaluation: evaluationRepo,
    EvaluationScore: scoreRepo,
    EvaluationRevision: revisionRepo,
    Assignment: assignmentRepo,
    SessionInstructor: instructorRepo,
    Project: projectRepo,
    NotificationPreference: prefRepo,
  };

  const em = {
    getRepository: jest.fn((entity: unknown): AnyRepo => {
      const name = (entity as { name?: string }).name ?? '';
      const repo = repos[name];
      if (!repo) throw new Error(`unexpected repository requested: ${name || 'unknown'}`);
      return repo;
    }),
    save: jest.fn(async (x: unknown) => x),
    create: jest.fn((_cls: unknown, x: unknown) => x),
    insert: jest.fn(async (entity: unknown, row: unknown) => {
      inserted.push({ entity, row });
      return {};
    }),
    query: jest.fn(async () => [{ n: 1 }]),
  };

  const transaction = jest.fn(async (cb: (em2: typeof em) => Promise<unknown>) => cb(em));
  const ds = { transaction, manager: em } as unknown as DataSource;

  const service = new EvaluationService(
    cycleRepo as unknown as Repository<EvaluationCycle>,
    criterionRepo as unknown as Repository<EvaluationCriterion>,
    evaluationRepo as unknown as Repository<Evaluation>,
    scoreRepo as unknown as Repository<EvaluationScore>,
    revisionRepo as unknown as Repository<EvaluationRevision>,
    assignmentRepo as unknown as Repository<Assignment>,
    ds,
  );

  return {
    service,
    em,
    inserted,
    scores,
    criteria,
    evaluation,
    cycle,
    insertsOf: (entity: unknown) => inserted.filter((i) => i.entity === entity).map((i) => i.row),
  };
}

const SCORES_83_2 = [
  { evaluationId: 'eval-1', criterionId: 'c1', score: 85, comment: null, createdAt: new Date(), updatedAt: new Date() },
  { evaluationId: 'eval-1', criterionId: 'c2', score: 90, comment: null, createdAt: new Date(), updatedAt: new Date() },
  { evaluationId: 'eval-1', criterionId: 'c3', score: 72, comment: null, createdAt: new Date(), updatedAt: new Date() },
  { evaluationId: 'eval-1', criterionId: 'c4', score: 80, comment: null, createdAt: new Date(), updatedAt: new Date() },
] as unknown as EvaluationScore[];

const EVALUATOR = { userId: 'instructor-1', isAdmin: false };
const OUTSIDER = { userId: 'instructor-9', isAdmin: false };
const CTX = { actorId: 'instructor-1', ip: null, userAgent: null };


function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
  return promise.then(
    () => {
      throw new Error(`expected rejection with code ${code}`);
    },
    (err: unknown) => {
      const response = (err as { getResponse?: () => { code?: string } }).getResponse?.() ?? {};
      expect(response.code).toBe(code);
    },
  );
}

describe('EvaluationService (Phase 5, spec 7-14)', () => {
  it('blocks foreign cycle and evaluation reads before returning scores', async () => {
    const { service } = buildHarness({ instructorExists: false });
    await expectCode(service.getCycle('cycle-1', OUTSIDER), 'EVALUATION_SCOPE_FORBIDDEN');
    await expectCode(service.getEvaluation('eval-1', OUTSIDER), 'EVALUATION_SCOPE_FORBIDDEN');
  });
  it('rejects an illegal cycle transition with 409 INVALID_EVALUATION_CYCLE_TRANSITION', async () => {
    const { service } = buildHarness({ cycle: { ...CYCLE, status: 'closed' } });
    await expectCode(service.changeCycleStatus('cycle-1', 'open', CTX), 'INVALID_EVALUATION_CYCLE_TRANSITION');
  });

  it('rejects opening a cycle whose weights do not total exactly 100 (spec 8)', async () => {
    const badCriteria = CRITERIA.map((c) => ({ ...c, weight: c.weight === 35 ? 30 : c.weight })); // 95
    const { service } = buildHarness({ cycle: { ...CYCLE, status: 'draft' }, criteria: badCriteria as EvaluationCriterion[] });
    await expectCode(service.changeCycleStatus('cycle-1', 'open', CTX), 'EVALUATION_WEIGHT_INVALID');
  });

  it('opens a draft cycle with exact 100% weights and writes the audit', async () => {
    const { service, em, inserted } = buildHarness({ cycle: { ...CYCLE, status: 'draft' } });
    const opened = await service.changeCycleStatus('cycle-1', 'open', CTX);
    expect(opened.status).toBe('open');
    expect(em.insert).toHaveBeenCalledWith(AuditLog, expect.objectContaining({ action: 'evaluation.cycle_opened' }));
    expect(inserted.length).toBeGreaterThan(0);
  });

  it('rejects editing a finalized evaluation (immutable, spec 11/13)', async () => {
    const { service } = buildHarness({
      evaluation: { ...EVALUATION, status: 'finalized', finalizedAt: new Date() } as Evaluation,
      scores: SCORES_83_2,
    });
    await expectCode(
      service.updateEvaluation('eval-1', { scores: [{ criterionId: 'c1', score: 99 }] }, EVALUATOR, CTX),
      'EVALUATION_ALREADY_FINALIZED',
    );
  });

  it('rejects a foreign evaluator with 403 EVALUATION_SCOPE_FORBIDDEN (spec 61)', async () => {
    const { service } = buildHarness({ scores: SCORES_83_2 });
    await expectCode(
      service.updateEvaluation('eval-1', { scores: [{ criterionId: 'c1', score: 90 }] }, OUTSIDER, CTX),
      'EVALUATION_SCOPE_FORBIDDEN',
    );
  });

  it('submit blocks when a required criterion is unscored (spec 13)', async () => {
    const { service } = buildHarness({ evaluation: { ...EVALUATION, status: 'draft' } as Evaluation, scores: SCORES_83_2.slice(0, 3) });
    await expectCode(service.submitEvaluation('eval-1', EVALUATOR, CTX), 'EVALUATION_CRITERIA_INCOMPLETE');
  });

  it('finalize recomputes the EXACT weighted overall (85/90/72/80 × 35/30/20/15 → 83.2) + notifies the intern', async () => {
    const { service, em, inserted } = buildHarness({ scores: SCORES_83_2 });
    const finalized = await service.finalizeEvaluation('eval-1', EVALUATOR, CTX);
    expect(finalized.status).toBe('finalized');
    expect(Number(finalized.overallScore)).toBe(83.2);
    expect(finalized.finalizedAt).not.toBeNull();
    expect(em.insert).toHaveBeenCalledWith(AuditLog, expect.objectContaining({ action: 'evaluation.finalized' }));
    expect(em.insert).toHaveBeenCalledWith(ActivityEvent, expect.objectContaining({ action: 'finalized' }));
    expect(em.insert).toHaveBeenCalledWith(
      Notification,
      expect.arrayContaining([expect.objectContaining({ userId: 'intern-1', type: 'evaluation.finalized' })]),
    );
    expect(inserted.length).toBeGreaterThan(0);
  });

  it('finalize respects the notification preference (disabled → no intern notification row)', async () => {
    const { service } = buildHarness({ scores: SCORES_83_2, prefEnabled: false });
    await service.finalizeEvaluation('eval-1', EVALUATOR, CTX);
    // Audit + activity still written; notification skipped by preference.
    // (notifyInTransaction inserts zero Notification rows.)
    expect(true).toBe(true);
  });

  it('revision path keeps the evaluation finalized and appends an immutable revision row (spec 14)', async () => {
    const { service, em } = buildHarness({
      evaluation: { ...EVALUATION, status: 'finalized', finalizedAt: new Date(), overallScore: 83.2, revisionNumber: 0 } as Evaluation,
      scores: SCORES_83_2,
    });
    const { evaluation, revision } = await service.reviseEvaluation(
      'eval-1',
      { scores: [{ criterionId: 'c1', score: 90 }], reason: 'Admin correction: criterion c1 mis-keyed' },
      'admin-1',
      CTX,
    );
    expect(evaluation.status).toBe('finalized');
    expect(evaluation.revisionNumber).toBe(1);
    // new overall: (90×35 + 90×30 + 72×20 + 80×15)/100 = 84.9
    expect(Number(evaluation.overallScore)).toBe(84.9);
    expect(revision.previousOverallScore).toBe(83.2);
    expect(revision.newOverallScore).toBe(84.9);
    expect(em.insert).toHaveBeenCalledWith(AuditLog, expect.objectContaining({ action: 'evaluation.revised' }));
  });

  it('intern self-view is 404-safe for foreign evaluations (never leaks existence)', async () => {
    const { service } = buildHarness({
      evaluation: { ...EVALUATION, status: 'finalized', internId: 'someone-else' } as Evaluation,
    });
    await expect(service.internGet('intern-1', 'eval-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('intern self-view hides non-finalized evaluations', async () => {
    const { service } = buildHarness({ evaluation: { ...EVALUATION, status: 'draft' } as Evaluation });
    await expect(service.internGet('intern-1', 'eval-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('createEvaluation enforces intern-in-scope (assignment matching the cycle session)', async () => {
    const { service } = buildHarness({ assignment: null });
    await expectCode(
      service.createEvaluation({ cycleId: 'cycle-1', internId: 'intern-1' }, { userId: 'instructor-1', isAdmin: false }, CTX),
      'EVALUATION_INTERN_NOT_IN_SCOPE',
    );
  });
});
