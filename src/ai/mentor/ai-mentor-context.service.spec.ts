import { AiMentorContextService } from './ai-mentor-context.service';
import { PerformanceMetrics } from '../../performance/performance-calculator';

/**
 * AI Mentor CONTEXT PRIVACY unit tests (Phase 6, spec 7/8/43):
 * the context contains ONLY the authenticated intern's own authorized
 * facts, NEVER secrets/email/GUIDs/foreign data, and unavailable facts
 * stay null (never faked to 0).
 */

type AnyMock = jest.Mock;
interface AnyRepo {
  [key: string]: AnyMock;
}

const OWN_USER = {
  id: 'user-own',
  displayName: 'Intern A',
  username: 'intern_a',
  email: 'a@vintern.test',
  passwordHash: 'secret-hash',
};

const METRICS: PerformanceMetrics = {
  totalTaskCount: 4,
  completedTaskCount: 3,
  taskCompletionRate: 75,
  committedStoryPoints: 20,
  completedStoryPoints: 12,
  storyPointCompletionRate: 60,
  onTimeCompletionRate: 66.7,
  onTimeCompletedTaskCount: 2,
  dueDatedCompletedTaskCount: 3,
  overdueOpenTaskCount: 1,
  averageEvaluationScore: 83.8,
  finalizedEvaluationCount: 1,
  activeSprintProgress: 45,
};

function buildHarness(opts?: {
  user?: Record<string, unknown> | null;
  assignment?: Record<string, unknown> | null;
  tasks?: Array<Record<string, unknown>>;
  evaluation?: Record<string, unknown> | null;
  kpiResult?: Record<string, unknown> | null;
  metrics?: PerformanceMetrics | null;
  metricsError?: boolean;
  eligibility?: Record<string, unknown> | null;
  eligibilityError?: boolean;
  salaryError?: boolean;
}) {
  const store: Record<string, unknown> = {
    user: opts?.user === undefined ? OWN_USER : opts.user,
    assignment:
      opts?.assignment === undefined
        ? { id: 'asg-1', internId: 'user-own', status: 'active', projectId: 'p1', sessionId: 's1', assignedAt: new Date('2026-01-05T00:00:00Z') }
        : opts.assignment,
    project: { id: 'p1', name: 'Intern Portal' },
    session: { id: 's1', name: 'Spring 2026' },
    sprint: { id: 'sp1', projectId: 'p1', status: 'active', code: 'SPRINT-2', name: 'Sprint 2', startDate: new Date(), endDate: new Date() },
    tasks: opts?.tasks ?? [],
    evaluation: opts?.evaluation ?? null,
    scores: [] as Array<Record<string, unknown>>,
    criteria: [] as Array<Record<string, unknown>>,
    cycle: { id: 'cycle-1', code: 'EV-1' },
    kpiResult: opts?.kpiResult ?? null,
    kpiMetrics: [] as Array<Record<string, unknown>>,
    kpiPeriod: { id: 'kper-1', code: 'KPI-2026-01' },
  };

  const repos: Record<string, AnyRepo> = {
    users: { findOne: jest.fn(async () => store.user) },
    recruitmentProfiles: { findOne: jest.fn(async () => ({ id: 'profile-own', userId: 'user-own', status: 'passed', selectedRole: 'frontend' })) },
    assignments: { findOne: jest.fn(async () => store.assignment) },
    projects: { findOne: jest.fn(async (args: { where: { id: string } }) => (args.where.id === 'p1' ? store.project : null)) },
    sessions: { findOne: jest.fn(async () => store.session) },
    sprints: { findOne: jest.fn(async () => store.sprint) },
    tasks: { find: jest.fn(async () => store.tasks) },
    evaluations: { findOne: jest.fn(async () => store.evaluation) },
    evaluationScores: { find: jest.fn(async () => store.scores) },
    evaluationCriteria: { find: jest.fn(async () => store.criteria) },
    evaluationCycles: { findOne: jest.fn(async () => store.cycle) },
    kpiResults: {
      createQueryBuilder: jest.fn(() => {
        const qb: AnyRepo = {};
        qb.innerJoin = jest.fn().mockReturnThis();
        qb.where = jest.fn().mockReturnThis();
        qb.andWhere = jest.fn().mockReturnThis();
        qb.orderBy = jest.fn().mockReturnThis();
        qb.getOne = jest.fn(async () => store.kpiResult);
        return qb;
      }),
    },
    kpiMetricResults: { find: jest.fn(async () => store.kpiMetrics) },
    kpiPeriods: { findOne: jest.fn(async () => store.kpiPeriod) },
    recruitmentResults: { findOne: jest.fn(async () => ({ technicalScore: 84, strengthsJson: '["React"]', weaknessesJson: '["TypeScript"]', criteriaJson: '[{"code":"english","score":73,"feedback":"Clear"}]' })) },
  };

  const performanceService = {
    ownMetrics: opts?.metricsError
      ? jest.fn(async () => {
          throw new Error('metrics unavailable');
        })
      : jest.fn(async () => ({ userId: 'user-own', metrics: opts?.metrics === undefined ? METRICS : opts.metrics })),
  };
  const salaryService = {
    balance: opts?.salaryError
      ? jest.fn(async () => {
          throw new Error('salary config missing');
        })
      : jest.fn(async () => ({ balance: 8380000, unit: 'VND_VIRTUAL', virtual: true })),
  };
  const certificatesService = {
    eligibilitySummary: opts?.eligibilityError
      ? jest.fn(async () => {
          throw new Error('policy failure');
        })
      : jest.fn(async () => opts?.eligibility ?? { policyCode: 'V-INTERN-COMPLETE', eligible: true, unmetRequirements: [] }),
  };

  const service = new AiMentorContextService(
    repos.users as never,
    repos.recruitmentProfiles as never,
    repos.assignments as never,
    repos.projects as never,
    repos.sessions as never,
    repos.sprints as never,
    repos.tasks as never,
    repos.evaluations as never,
    repos.evaluationScores as never,
    repos.evaluationCriteria as never,
    repos.evaluationCycles as never,
    repos.kpiResults as never,
    repos.kpiMetricResults as never,
    repos.kpiPeriods as never,
    performanceService as never,
    salaryService as never,
    certificatesService as never,
    repos.recruitmentResults as never,
    { collect: jest.fn(async () => ({ headSha: 'a'.repeat(40), complete: true, warnings: [], files: [{ path: 'src/App.tsx', sha: 'b'.repeat(40), content: 'export const title = "Notes";', lineCount: 1, patch: '' }] })) } as never,
  );

  return { service, repos, performanceService, salaryService, certificatesService, store };
}

describe('AiMentorContextService privacy', () => {
  it('grounds advice in the principal interview gaps and source from the selected own task snapshot', async () => {
    const h = buildHarness();
    h.repos.tasks.findOne = jest.fn(async () => ({ id: 't1', code: 'VIN-1', title: 'Notes', projectId: 'p1', sprintId: 'sp1' }));
    h.repos.tasks.query = jest.fn(async (sql: string) => sql.includes('task_specs') ? [{ specJson: '{"dod":["Persist after reload"]}' }]
      : sql.includes('TOP(1) s.headSha') ? [{ headSha: 'a'.repeat(40), baseSha: 'c'.repeat(40), repositoryId: '12', sourceKind: 'pull', sourceRef: '3', pullNumber: 3 }] : []);
    const ctx = await h.service.buildContext('user-own', 't1');
    expect(ctx.interviewAssessment?.weaknesses).toEqual(['TypeScript']);
    expect(ctx.selectedTask?.codeContext).toMatchObject({ status: 'available', headSha: 'a'.repeat(40), files: [{ path: 'src/App.tsx' }] });
    expect(h.repos.recruitmentResults.findOne).toHaveBeenCalledWith(expect.objectContaining({ where: { profileId: 'profile-own' } }));
  });
  it('builds authorized own facts (identity safe fields, assignment, sprint, tasks)', async () => {
    const h = buildHarness({
      tasks: [
        { id: 't1', code: 'VIN-101', title: 'Fix login bug', status: 'doing', priority: 'high', progress: 40, storyPoints: 3, dueDate: new Date(Date.now() - 86400000), createdAt: new Date(), deletedAt: null },
        { id: 't2', code: 'VIN-102', title: 'Write docs', status: 'done', priority: 'low', progress: 100, storyPoints: 2, dueDate: null, createdAt: new Date(), deletedAt: null },
      ],
    });
    const ctx = await h.service.buildContext('user-own');
    expect(ctx.intern).toEqual({ displayName: 'Intern A', username: 'intern_a', recruitmentStatus: 'passed', recruitmentRole: 'frontend' });
    expect(ctx.assignment).toMatchObject({ projectName: 'Intern Portal', sessionName: 'Spring 2026', status: 'active' });
    expect(ctx.currentSprint?.code).toBe('SPRINT-2');
    expect(ctx.taskSummary).toEqual({ todo: 0, doing: 1, review: 0, done: 1, total: 2 });
    // Open tasks exclude done; overdue flag derived from real dueDate.
    expect(ctx.openTasks).toHaveLength(1);
    expect(ctx.openTasks[0]).toMatchObject({ code: 'VIN-101', overdue: true });
    expect(ctx.overdueOpenTaskCount).toBe(1);
  });

  it('NEVER leaks email, password hash, or DB GUIDs into the context (spec 8)', async () => {
    const h = buildHarness();
    const ctx = await h.service.buildContext('user-own');
    const serialized = JSON.stringify(ctx);
    expect(serialized).not.toContain('a@vintern.test');
    expect(serialized).not.toContain('secret-hash');
    expect(serialized).not.toContain('passwordHash');
    expect(serialized).not.toContain('email');
    expect(serialized).not.toContain('asg-1');
    expect(serialized).not.toContain('user-own');
  });

  it('open tasks are capped at 5 (spec 59 — context token control)', async () => {
    const tasks = Array.from({ length: 9 }, (_, i) => ({
      id: `t${i}`,
      code: `VIN-${100 + i}`,
      title: `Task ${i}`,
      status: 'todo',
      priority: 'medium',
      progress: 0,
      storyPoints: 1,
      dueDate: new Date(Date.now() + (i + 1) * 86400000),
      createdAt: new Date(),
      deletedAt: null,
    }));
    const h = buildHarness({ tasks });
    const ctx = await h.service.buildContext('user-own');
    expect(ctx.openTasks).toHaveLength(5);
    expect(ctx.taskSummary.total).toBe(9);
  });

  it('missing KPI stays null (unavailable ≠ 0, spec 43) and metrics failure keeps null', async () => {
    const h = buildHarness({ kpiResult: null, metricsError: true, eligibilityError: true, salaryError: true });
    const ctx = await h.service.buildContext('user-own');
    expect(ctx.latestKpi).toBeNull();
    expect(ctx.performanceMetrics).toBeNull();
    expect(ctx.certificateEligibility).toBeNull();
    expect(ctx.virtualSalary).toBeNull();
    const serialized = JSON.stringify(ctx);
    expect(serialized).not.toContain('"finalScore":0');
  });

  it('latest finalized KPI exposes component metric values (factual grounding)', async () => {
    const h = buildHarness({
      kpiResult: { id: 'kr1', periodId: 'kper-1', userId: 'user-own', ruleVersion: 'kpi-v1', status: 'calculated', finalScore: 83.8, calculatedAt: new Date('2026-02-01T00:00:00Z') },
      tasks: [],
    });
    h.store.kpiMetrics = [
      { metricCode: 'delivery', sourceValue: 75, effectiveWeight: 50, weightedContribution: 37.5 },
      { metricCode: 'quality', sourceValue: 83.8, effectiveWeight: 50, weightedContribution: 41.9 },
    ];
    const ctx = await h.service.buildContext('user-own');
    expect(ctx.latestKpi?.finalScore).toBe(83.8);
    expect(ctx.latestKpi?.metrics.map((m) => m.metricCode)).toEqual(['delivery', 'quality']);
  });

  it('the intern queries their own id — repos are never called with a foreign id', async () => {
    const h = buildHarness();
    await h.service.buildContext('user-own');
    expect(h.repos.users.findOne).toHaveBeenCalledWith({ where: { id: 'user-own' } });
    expect(h.repos.recruitmentProfiles.findOne).toHaveBeenCalledWith({ where: { userId: 'user-own' } });
    expect(h.repos.tasks.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ assigneeId: 'user-own' }) }),
    );
  });
});
