import { NotFoundException } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, In } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { RecruitmentProfile } from '../../recruitment/entities/recruitment-profile.entity';
import { Assignment } from '../../assignments/entities/assignment.entity';
import { Project } from '../../projects/entities/project.entity';
import { InternshipSession } from '../../sessions/entities/internship-session.entity';
import { Sprint } from '../../sprints/entities/sprint.entity';
import { Task } from '../../tasks/entities/task.entity';
import { Evaluation } from '../../evaluation/entities/evaluation.entity';
import { EvaluationScore } from '../../evaluation/entities/evaluation-score.entity';
import { EvaluationCriterion } from '../../evaluation/entities/evaluation-criterion.entity';
import { EvaluationCycle } from '../../evaluation/entities/evaluation-cycle.entity';
import { KpiResult } from '../../kpi/entities/kpi-result.entity';
import { KpiMetricResult } from '../../kpi/entities/kpi-metric-result.entity';
import { KpiPeriod } from '../../kpi/entities/kpi-period.entity';
import { PerformanceService } from '../../performance/performance.service';
import { VirtualSalaryService } from '../../salary/virtual-salary.service';
import { CertificatesService } from '../../certificates/certificates.service';

/**
 * AiMentorContextService (Phase 6, spec 7/8/9) — builds the ONLY data the
 * AI mentor may see about an intern.
 *
 * PRIVACY CONTRACT (spec 8 — enforced here, verified by tests):
 * - Identity comes from the authenticated principal ONLY; no acting
 *   userId is ever accepted.
 * - NEVER included: passwordHash, refresh tokens, JWT, email, IP,
 *   raw audit logs, OTHER users' identities/data, private instructor
 *   draft/evaluation notes, DB GUIDs (stable human codes instead).
 * - null/absent facts are serialized AS unavailable (never faked to 0 —
 *   spec 43): the model must be able to say "unavailable".
 * - Facts are clearly separated from the user message in the prompt
 *   payload (spec 9): { workspaceFacts, conversationHistory, userMessage }.
 */
export interface MentorWorkspaceFacts {
  generatedAt: string;
  selectedTask?: { code: string; title: string; description: string | null; specification: unknown; latestCodeFeedback: unknown } | null;
  intern: {
    displayName: string;
    username: string;
    recruitmentStatus: string;
    recruitmentRole: string | null;
  };
  assignment: {
    status: string;
    projectName: string;
    sessionName: string | null;
    assignedAt: string;
  } | null;
  currentSprint: {
    code: string;
    name: string;
    status: string;
    startDate: string;
    endDate: string;
  } | null;
  taskSummary: { todo: number; doing: number; review: number; done: number; total: number };
  openTasks: Array<{
    code: string;
    title: string;
    status: string;
    priority: string;
    progress: number;
    storyPoints: number | null;
    dueDate: string | null;
    overdue: boolean;
  }>;
  overdueOpenTaskCount: number;
  latestFinalizedEvaluation: {
    cycleCode: string;
    overallScore: number;
    finalizedAt: string;
    summary: string | null;
    criteria: Array<{ code: string; name: string; score: number; weight: number; comment: string | null }>;
  } | null;
  performanceMetrics: {
    completedTaskCount: number;
    totalTaskCount: number;
    taskCompletionRate: number | null;
    completedStoryPoints: number;
    committedStoryPoints: number;
    storyPointCompletionRate: number | null;
    onTimeCompletionRate: number | null;
    overdueOpenTaskCount: number;
    averageEvaluationScore: number | null;
    activeSprintProgress: number | null;
  } | null;
  latestKpi: {
    periodCode: string;
    ruleVersion: string;
    status: string;
    finalScore: number | null;
    calculatedAt: string;
    metrics: Array<{
      metricCode: string;
      value: number | null;
      effectiveWeight: number | null;
      weightedContribution: number | null;
    }>;
  } | null;
  certificateEligibility: {
    policyCode: string;
    eligible: boolean;
    unmetRequirements: string[];
  } | null;
  virtualSalary: { unit: string; balance: number } | null;
}

const OPEN_TASK_LIMIT = 5;
const iso = (d: Date): string => d.toISOString();

@Injectable()
export class AiMentorContextService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(RecruitmentProfile) private readonly recruitmentProfiles: Repository<RecruitmentProfile>,
    @InjectRepository(Assignment) private readonly assignments: Repository<Assignment>,
    @InjectRepository(Project) private readonly projects: Repository<Project>,
    @InjectRepository(InternshipSession) private readonly sessions: Repository<InternshipSession>,
    @InjectRepository(Sprint) private readonly sprints: Repository<Sprint>,
    @InjectRepository(Task) private readonly tasks: Repository<Task>,
    @InjectRepository(Evaluation) private readonly evaluations: Repository<Evaluation>,
    @InjectRepository(EvaluationScore) private readonly evaluationScores: Repository<EvaluationScore>,
    @InjectRepository(EvaluationCriterion) private readonly evaluationCriteria: Repository<EvaluationCriterion>,
    @InjectRepository(EvaluationCycle) private readonly evaluationCycles: Repository<EvaluationCycle>,
    @InjectRepository(KpiResult) private readonly kpiResults: Repository<KpiResult>,
    @InjectRepository(KpiMetricResult) private readonly kpiMetricResults: Repository<KpiMetricResult>,
    @InjectRepository(KpiPeriod) private readonly kpiPeriods: Repository<KpiPeriod>,
    private readonly performanceService: PerformanceService,
    private readonly salaryService: VirtualSalaryService,
    private readonly certificatesService: CertificatesService,
  ) {}

  /**
   * Build the authorized workspace facts for ONE intern. Every query is
   * scoped by `userId` = the authenticated principal. Absent facts stay
   * null — never zero, never invented (spec 43).
   */
  async buildContext(userId: string, selectedTaskId?: string): Promise<MentorWorkspaceFacts> {
    const [user, profile, assignment] = await Promise.all([
      this.users.findOne({ where: { id: userId } }),
      this.recruitmentProfiles.findOne({ where: { userId } }),
      this.assignments.findOne({
        where: [{ internId: userId, status: 'active' }, { internId: userId, status: 'completed' }],
        order: { assignedAt: 'DESC' },
      }),
    ]);

    const facts: MentorWorkspaceFacts = {
      generatedAt: new Date().toISOString(),
      selectedTask: null,
      intern: {
        displayName: user?.displayName ?? '',
        username: user?.username ?? '',
        recruitmentStatus: profile?.status ?? 'not_started',
        recruitmentRole: profile?.selectedRole ?? null,
      },
      assignment: null,
      currentSprint: null,
      taskSummary: { todo: 0, doing: 0, review: 0, done: 0, total: 0 },
      openTasks: [],
      overdueOpenTaskCount: 0,
      latestFinalizedEvaluation: null,
      performanceMetrics: null,
      latestKpi: null,
      certificateEligibility: null,
      virtualSalary: null,
    };

    let projectId: string | null = null;
    if (assignment) {
      projectId = assignment.projectId;
      const [project, session] = await Promise.all([
        this.projects.findOne({ where: { id: assignment.projectId } }),
        assignment.sessionId ? this.sessions.findOne({ where: { id: assignment.sessionId } }) : null,
      ]);
      facts.assignment = {
        status: assignment.status,
        projectName: project?.name ?? '',
        sessionName: session?.name ?? null,
        assignedAt: iso(assignment.assignedAt),
      };
    }

    // ── Sprint + own tasks (current project only — bounded window) ────────
    if (projectId) {
      const activeSprint = await this.sprints.findOne({
        where: { projectId, status: 'active' },
      });
      if (activeSprint) {
        facts.currentSprint = {
          code: activeSprint.code,
          name: activeSprint.name,
          status: activeSprint.status,
          startDate: iso(activeSprint.startDate),
          endDate: iso(activeSprint.endDate),
        };
      }
      const ownTasks = await this.tasks.find({
        where: { assigneeId: userId, projectId, deletedAt: IsNull() },
      });
      const summary = { todo: 0, doing: 0, review: 0, done: 0, total: ownTasks.length };
      for (const t of ownTasks) summary[t.status] += 1;
      facts.taskSummary = summary;
      const now = Date.now();
      const open = ownTasks
        .filter((t) => t.status !== 'done')
        .sort((a, b) => {
          if (a.dueDate && b.dueDate) return a.dueDate.getTime() - b.dueDate.getTime();
          if (a.dueDate) return -1;
          if (b.dueDate) return 1;
          return a.createdAt.getTime() - b.createdAt.getTime();
        });
      facts.overdueOpenTaskCount = open.filter(
        (t) => t.dueDate !== null && t.dueDate.getTime() < now,
      ).length;
      facts.openTasks = open.slice(0, OPEN_TASK_LIMIT).map((t) => ({
        code: t.code,
        title: t.title,
        status: t.status,
        priority: t.priority,
        progress: t.progress,
        storyPoints: t.storyPoints ?? null,
        dueDate: t.dueDate ? iso(t.dueDate) : null,
        overdue: t.dueDate !== null && t.dueDate.getTime() < now,
      }));
    }

    // ── Latest finalized evaluation with criterion scores ────────────────
    const latestEvaluation = await this.evaluations.findOne({
      where: { internId: userId, status: 'finalized' },
      order: { finalizedAt: 'DESC' },
    });
    if (latestEvaluation) {
      const [cycle, scores] = await Promise.all([
        this.evaluationCycles.findOne({ where: { id: latestEvaluation.cycleId } }),
        this.evaluationScores.find({ where: { evaluationId: latestEvaluation.id } }),
      ]);
      const criterionIds = scores.map((s) => s.criterionId);
      const criteria = criterionIds.length
        ? await this.evaluationCriteria.find({ where: { id: In(criterionIds) } })
        : [];
      const criterionById = new Map(criteria.map((c) => [c.id, c]));
      facts.latestFinalizedEvaluation = {
        cycleCode: cycle?.code ?? '',
        overallScore: Number(latestEvaluation.overallScore ?? 0),
        finalizedAt: latestEvaluation.finalizedAt ? iso(latestEvaluation.finalizedAt) : '',
        summary: latestEvaluation.summary ?? null,
        criteria: scores
          .map((s) => {
            const c = criterionById.get(s.criterionId);
            return {
              code: c?.code ?? '',
              name: c?.name ?? '',
              score: Number(s.score),
              weight: c ? Number(c.weight) : 0,
              comment: s.comment ?? null,
            };
          })
          .sort((a, b) => a.code.localeCompare(b.code)),
      };
    }

    // ── Deterministic performance metrics (lifetime scope) ───────────────
    try {
      const own = await this.performanceService.ownMetrics(userId, {});
      facts.performanceMetrics = {
        completedTaskCount: own.metrics.completedTaskCount,
        totalTaskCount: own.metrics.totalTaskCount,
        taskCompletionRate: own.metrics.taskCompletionRate,
        completedStoryPoints: own.metrics.completedStoryPoints,
        committedStoryPoints: own.metrics.committedStoryPoints,
        storyPointCompletionRate: own.metrics.storyPointCompletionRate,
        onTimeCompletionRate: own.metrics.onTimeCompletionRate,
        overdueOpenTaskCount: own.metrics.overdueOpenTaskCount,
        averageEvaluationScore: own.metrics.averageEvaluationScore,
        activeSprintProgress: own.metrics.activeSprintProgress,
      };
    } catch {
      // Metrics are read-model data: if the computation is impossible for
      // this intern the facts simply say "unavailable" — never 0, never a
      // fabricated number (spec 43).
      facts.performanceMetrics = null;
    }

    // ── Latest finalized KPI result + its component metrics ──────────────
    const latestKpi = await this.kpiResults
      .createQueryBuilder('r')
      .innerJoin(KpiPeriod, 'p', 'p.id = r.periodId')
      .where('r.userId = :userId', { userId })
      .andWhere('p.status = :status', { status: 'finalized' })
      .orderBy('r.calculatedAt', 'DESC')
      .getOne();
    if (latestKpi) {
      const [period, metrics] = await Promise.all([
        this.kpiPeriods.findOne({ where: { id: latestKpi.periodId } }),
        this.kpiMetricResults.find({ where: { kpiResultId: latestKpi.id } }),
      ]);
      facts.latestKpi = {
        periodCode: period?.code ?? '',
        ruleVersion: latestKpi.ruleVersion,
        status: latestKpi.status,
        finalScore: latestKpi.finalScore === null ? null : Number(latestKpi.finalScore),
        calculatedAt: iso(latestKpi.calculatedAt),
        metrics: metrics
          .map((m) => ({
            metricCode: m.metricCode,
            value: m.sourceValue === null ? null : Number(m.sourceValue),
            effectiveWeight: m.effectiveWeight === null ? null : Number(m.effectiveWeight),
            weightedContribution:
              m.weightedContribution === null ? null : Number(m.weightedContribution),
          }))
          .sort((a, b) => a.metricCode.localeCompare(b.metricCode)),
      };
    }

    // ── Certificate eligibility summary + virtual salary (own views) ─────
    try {
      facts.certificateEligibility = await this.certificatesService.eligibilitySummary(userId);
    } catch {
      facts.certificateEligibility = null;
    }
    try {
      const balance = await this.salaryService.balance(userId);
      facts.virtualSalary = { unit: balance.unit, balance: Number(balance.balance) };
    } catch {
      facts.virtualSalary = null;
    }

    if (selectedTaskId) {
      const task = await this.tasks.findOne({ where: { id: selectedTaskId, assigneeId: userId, deletedAt: IsNull() } });
      if (!task || !assignment || task.projectId.toLowerCase() !== assignment.projectId.toLowerCase()) throw new NotFoundException('Task không thuộc phân công hiện tại của bạn.');
      if (task.sprintId && assignment.sessionId) {
        const sprint = await this.sprints.findOne({ where: { id: task.sprintId, sessionId: assignment.sessionId } });
        if (!sprint) throw new NotFoundException('Task không thuộc phiên của bạn.');
      }
      const specs: Array<{ specJson: string }> = await this.tasks.query('SELECT specJson FROM task_specs WHERE taskId=@0', [task.id]);
      const feedback: Array<{ resultJson: string | null; status: string }> = await this.tasks.query(`SELECT TOP(1) r.resultJson,r.status FROM submission_code_reviews r
        JOIN task_submissions s ON s.id=r.submissionId WHERE s.taskId=@0 AND s.internId=@1 AND r.status<>'running' ORDER BY r.createdAt DESC,r.id DESC`, [task.id, userId]);
      facts.selectedTask = { code: task.code, title: task.title, description: task.description, specification: specs[0] ? JSON.parse(specs[0].specJson) as unknown : null, latestCodeFeedback: feedback[0]?.resultJson ? { status: feedback[0].status, review: JSON.parse(feedback[0].resultJson) as unknown } : null };
    }

    return facts;
  }
}
