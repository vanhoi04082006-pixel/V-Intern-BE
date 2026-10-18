import { AiInvalidResponseError } from '../ai/ai-errors';

/**
 * STRICT structured-output contract for AI sprint/task drafts
 * (redesign §17-19/§41-42).
 *
 * The provider returns a PLAN ONLY — nothing is persisted from it.
 * Unknown fields (approvals, scores, decisions) are dropped, never stored.
 * The confirm endpoint re-validates the (possibly instructor-edited) draft
 * with this same validator before creating anything.
 */

export interface PlannedTask {
  key?: string;
  parentKey?: string | null;
  dependsOn?: string[];
  expectedOutput?: string | null;
  estimatedHours?: number | null;
  skillTags?: string[];
  complexity?: 'beginner' | 'intermediate' | 'advanced';
  acceptanceCriteria: string[];
  title: string;
  description: string | null;
  priority: 'low' | 'medium' | 'high' | 'critical';
  storyPoints: number | null;
  dueDate: string | null;
  suggestedRole: string | null;
  assigneeId: string | null;
}

export interface PlannedSprint {
  code: string | null;
  name: string;
  goal: string | null;
  startDate: string;
  endDate: string;
  tasks: PlannedTask[];
}

export interface SprintPlan {
  sprints: PlannedSprint[];
  milestones?: Array<{ key: string; title: string; dueDate: string; taskKeys: string[] }>;
}

const MAX_SPRINTS = 8;
const MAX_TASKS_PER_SPRINT = 30;
const MAX_NAME = 256;
const MAX_TEXT = 4000;
const MAX_ROLE = 64;
const PRIORITIES = ['low', 'medium', 'high', 'critical'] as const;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fail(message: string): never {
  throw new AiInvalidResponseError(message);
}

function record(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(`${field} must be an object`);
  }
  return value as Record<string, unknown>;
}

function boundedString(value: unknown, field: string, max: number, required: boolean): string | null {
  if (value === undefined || value === null) {
    if (required) fail(`${field} is required`);
    return null;
  }
  if (typeof value !== 'string') fail(`${field} must be a string`);
  const trimmed = (value as string).trim();
  if (required && trimmed.length === 0) fail(`${field} must not be empty`);
  if (trimmed.length > max) fail(`${field} exceeds ${max} characters`);
  return trimmed.length === 0 ? null : trimmed;
}

function isoDate(value: unknown, field: string, required: boolean): string | null {
  if (value === undefined || value === null) {
    if (required) fail(`${field} is required`);
    return null;
  }
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    fail(`${field} must be an ISO date`);
  }
  return new Date(value as string).toISOString();
}

function storyPoints(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) fail('story points must be a number');
  const rounded = Math.round(value as number);
  if (rounded < 0 || rounded > 100) fail('story points out of bounds (0..100)');
  return rounded;
}

function priority(value: unknown): PlannedTask['priority'] {
  if (value === undefined || value === null) return 'medium';
  if (typeof value !== 'string' || !(PRIORITIES as readonly string[]).includes(value)) {
    fail(`priority must be one of ${PRIORITIES.join(', ')}`);
  }
  return value as PlannedTask['priority'];
}

function uuidOrNull(value: unknown, field: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || !UUID_RE.test(value)) fail(`${field} must be a UUID`);
  return value as string;
}

function plannedTask(raw: unknown, index: number): PlannedTask {
  const v = record(raw, `tasks[${index}]`);
  const criteria = v.acceptanceCriteria ?? [];
  if (!Array.isArray(criteria) || criteria.length > 20) fail('acceptance criteria must be an array of at most 20 strings');
  return {
    key: planKey(v.key, 'task key') ?? undefined,
    parentKey: planKey(v.parentKey, 'parent key'),
    dependsOn: stringList(v.dependsOn, 'dependencies', 20).map(key => planKey(key, 'dependency')!),
    expectedOutput: boundedString(v.expectedOutput, 'expected output', 2000, false),
    estimatedHours: hours(v.estimatedHours),
    skillTags: stringList(v.skillTags, 'skill tags', 20),
    complexity: complexity(v.complexity),
    acceptanceCriteria: criteria.map((item) => boundedString(item, 'acceptance criteria', 512, false)).filter((item): item is string => item !== null),
    title: boundedString(v.title, `tasks[${index}].title`, MAX_NAME, true) as string,
    description: boundedString(v.description, `tasks[${index}].description`, MAX_TEXT, false),
    priority: priority(v.priority),
    storyPoints: storyPoints(v.storyPoints),
    dueDate: isoDate(v.dueDate, `tasks[${index}].dueDate`, false),
    suggestedRole: boundedString(v.suggestedRole ?? v.role, `tasks[${index}].suggestedRole`, MAX_ROLE, false),
    assigneeId: uuidOrNull(v.assigneeId, `tasks[${index}].assigneeId`),
  };
}

function stringList(value: unknown, field: string, max: number): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > max) fail(`${field} must be an array with at most ${max} items`);
  const list = value.map(v => boundedString(v, field, 128, true) as string);
  if (new Set(list).size !== list.length) fail(`${field} must not contain duplicates`);
  return list;
}
function planKey(value: unknown, field: string): string | null {
  const key = boundedString(value, field, 64, false);
  if (key !== null && !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(key)) fail(`${field} must be a stable short identifier`);
  return key;
}
function hours(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0.5 || value > 160) fail('estimated hours must be between 0.5 and 160');
  return value;
}
function complexity(value: unknown): NonNullable<PlannedTask['complexity']> {
  if (value === undefined) return 'beginner';
  if (!['beginner', 'intermediate', 'advanced'].includes(String(value))) fail('invalid task complexity');
  return value as NonNullable<PlannedTask['complexity']>;
}

function validateGraph(plan: SprintPlan) {
  const tasks = plan.sprints.flatMap((s, si) => s.tasks.map((t, ti) => ({ ...t, key: t.key ?? `s${si + 1}-t${ti + 1}`, sprint: si, due: t.dueDate ?? s.endDate })));
  const byKey = new Map(tasks.map(t => [t.key, t]));
  if (byKey.size !== tasks.length) fail('task keys must be unique throughout the plan');
  plan.sprints.forEach((s, si) => s.tasks.forEach((t, ti) => { t.key = t.key ?? `s${si + 1}-t${ti + 1}`; }));
  const visiting = new Set<string>(), visited = new Set<string>();
  function visit(key: string) {
    if (visiting.has(key)) fail('cyclic task dependencies or parent links');
    if (visited.has(key)) return;
    visiting.add(key);
    const task = byKey.get(key)!;
    for (const ref of [...(task.dependsOn ?? []), ...(task.parentKey ? [task.parentKey] : [])]) {
      if (!byKey.has(ref)) fail(`task reference '${ref}' is outside the plan`);
      if (ref === key) fail('task cannot reference itself');
      visit(ref);
    }
    for (const ref of task.dependsOn ?? []) {
      const dependency = byKey.get(ref)!;
      if (dependency.sprint > task.sprint || Date.parse(dependency.due) > Date.parse(task.due)) fail('dependency must be scheduled before its dependent task');
    }
    visiting.delete(key); visited.add(key);
  }
  tasks.forEach(t => visit(t.key));
  for (const milestone of plan.milestones ?? []) {
    if (!milestone.taskKeys.length || milestone.taskKeys.some(key => !byKey.has(key))) fail('milestone must reference tasks in this plan');
    const deadline = Date.parse(milestone.dueDate);
    const start = Math.min(...plan.sprints.map(s => Date.parse(s.startDate))), end = Math.max(...plan.sprints.map(s => Date.parse(s.endDate)));
    if (deadline < start || deadline > end || milestone.taskKeys.some(key => Date.parse(byKey.get(key)!.due) > deadline)) fail('milestone must follow its task deadlines inside the plan window');
  }
}

function plannedSprint(raw: unknown, index: number): PlannedSprint {
  const v = record(raw, `sprints[${index}]`);
  const startDate = isoDate(v.startDate, `sprints[${index}].startDate`, true) as string;
  const endDate = isoDate(v.endDate, `sprints[${index}].endDate`, true) as string;
  if (Date.parse(endDate) < Date.parse(startDate)) {
    fail(`sprints[${index}].endDate must be on or after startDate`);
  }
  const tasksRaw = v.tasks ?? [];
  if (!Array.isArray(tasksRaw)) fail(`sprints[${index}].tasks must be an array`);
  if (tasksRaw.length > MAX_TASKS_PER_SPRINT) {
    fail(`sprints[${index}] has too many tasks (max ${MAX_TASKS_PER_SPRINT})`);
  }
  return {
    code: boundedString(v.code, `sprints[${index}].code`, 64, false),
    name: boundedString(v.name, `sprints[${index}].name`, MAX_NAME, true) as string,
    goal: boundedString(v.goal, `sprints[${index}].goal`, 512, false),
    startDate,
    endDate,
    tasks: tasksRaw.map((t, i) => plannedTask(t, i)),
  };
}

export function validateSprintPlan(raw: unknown): SprintPlan {
  const v = record(raw, 'plan');
  if (!Array.isArray(v.sprints)) fail('plan.sprints must be an array');
  if (v.sprints.length === 0) fail('plan must contain at least one sprint');
  if (v.sprints.length > MAX_SPRINTS) fail(`plan has too many sprints (max ${MAX_SPRINTS})`);
  const plan: SprintPlan = { sprints: v.sprints.map((s, i) => plannedSprint(s, i)) };
  if (v.milestones !== undefined) {
    if (!Array.isArray(v.milestones) || v.milestones.length > 20) fail('milestones must be an array of at most 20');
    plan.milestones = v.milestones.map(raw => {
      const m = record(raw, 'milestone');
      return { key: planKey(m.key, 'milestone key') ?? fail('milestone key required'), title: boundedString(m.title, 'milestone title', 256, true)!, dueDate: isoDate(m.dueDate, 'milestone due date', true)!, taskKeys: stringList(m.taskKeys, 'milestone task keys', 240) };
    });
    if (new Set(plan.milestones.map(m => m.key)).size !== plan.milestones.length) fail('milestone keys must be unique');
  }
  validateGraph(plan);
  return plan;
}
