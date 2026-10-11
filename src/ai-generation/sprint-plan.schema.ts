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
  return {
    title: boundedString(v.title, `tasks[${index}].title`, MAX_NAME, true) as string,
    description: boundedString(v.description, `tasks[${index}].description`, MAX_TEXT, false),
    priority: priority(v.priority),
    storyPoints: storyPoints(v.storyPoints),
    dueDate: isoDate(v.dueDate, `tasks[${index}].dueDate`, false),
    suggestedRole: boundedString(v.suggestedRole ?? v.role, `tasks[${index}].suggestedRole`, MAX_ROLE, false),
    assigneeId: uuidOrNull(v.assigneeId, `tasks[${index}].assigneeId`),
  };
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
  return { sprints: v.sprints.map((s, i) => plannedSprint(s, i)) };
}
