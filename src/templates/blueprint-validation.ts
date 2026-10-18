import { BadRequestException } from '@nestjs/common';
import type { CreateTemplateDto } from './template.dto';

/** Metadata remains optional for historic snapshots; supplied graphs must be complete. */
export function validateBlueprint(definition: CreateTemplateDto): void {
  const fail = (message: string): never => { throw new BadRequestException({ code: 'INVALID_BLUEPRINT', message }); };
  if (definition.slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(definition.slug)) fail('Slug must use lowercase words separated by hyphens.');
  const duration = definition.sprints.reduce((n, s) => n + s.durationDays, 0);
  if (definition.estimatedDurationDays !== undefined && definition.estimatedDurationDays !== duration) fail('Estimated duration must equal total sprint days.');
  const entries = definition.sprints.flatMap((sprint, index) => sprint.tasks.map(task => ({ task, sprint: index })));
  const keyed = new Map(entries.filter(e => e.task.key).map(e => [e.task.key!, e]));
  if (keyed.size !== entries.filter(e => e.task.key).length) fail('Task keys must be unique.');
  const visit = (key: string, active: Set<string>, done: Set<string>): void => {
    if (active.has(key)) fail('Task dependencies must not contain cycles.');
    if (done.has(key)) return;
    active.add(key);
    const entry = keyed.get(key)!;
    for (const dependency of entry.task.dependsOn ?? []) {
      const prior = keyed.get(dependency);
      if (!prior || prior.sprint > entry.sprint) fail('Task dependencies must refer to existing tasks in the same or earlier sprint.');
      visit(dependency, active, done);
    }
    active.delete(key); done.add(key);
  };
  const done = new Set<string>();
  for (const { task } of entries) {
    if (task.dependsOn?.length && !task.key) fail('Tasks with dependencies require a key.');
    if (task.key) visit(task.key, new Set(), done);
  }
  const sprintEnds = definition.sprints.map((_, index) => definition.sprints.slice(0, index + 1).reduce((n, s) => n + s.durationDays, 0));
  for (const milestone of definition.milestones ?? []) {
    if (milestone.day > duration) fail('Milestone must fit within the blueprint duration.');
    for (const key of milestone.taskKeys) {
      const entry = keyed.get(key);
      if (!entry || sprintEnds[entry.sprint] > milestone.day) fail('Milestone must reference tasks deliverable by that day.');
    }
  }
  if (definition.recommendedTeamSize !== undefined && definition.roleDetails?.length) {
    const min = definition.roleDetails.reduce((n, r) => n + (r.countMin ?? 1), 0);
    const max = definition.roleDetails.reduce((n, r) => n + (r.countMax ?? r.countMin ?? 1), 0);
    if (definition.recommendedTeamSize < min || definition.recommendedTeamSize > max) fail('Recommended team size must fit role capacity.');
  }
}
