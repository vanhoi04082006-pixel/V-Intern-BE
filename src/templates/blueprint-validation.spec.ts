import { validateBlueprint } from './blueprint-validation';
import { LEARNING_LIBRARY } from './learning-library';
const fixture = () => structuredClone(LEARNING_LIBRARY[0]);
describe('blueprint domain consistency', () => {
  it('validates every complete shipped blueprint', () => { for (const template of LEARNING_LIBRARY) expect(() => validateBlueprint(template)).not.toThrow(); });
  it('keeps legacy definitions without metadata valid', () => { const t = fixture(); delete t.milestones; delete t.estimatedDurationDays; t.sprints.forEach(s => s.tasks.forEach(task => { delete task.key; delete task.dependsOn; })); expect(() => validateBlueprint(t)).not.toThrow(); });
  it.each(['cycle', 'missing', 'later', 'duplicate'] as const)('rejects %s dependencies', mode => {
    const t = fixture(), first = t.sprints[0].tasks[0], last = t.sprints[1].tasks[0];
    if (mode === 'cycle') first.dependsOn = [first.key!];
    if (mode === 'missing') first.dependsOn = ['absent'];
    if (mode === 'later') first.dependsOn = [last.key!];
    if (mode === 'duplicate') last.key = first.key;
    expect(() => validateBlueprint(t)).toThrow();
  });
  it('rejects contradictory duration, milestone and staffing metadata', () => {
    const duration = fixture(); duration.estimatedDurationDays = 3; expect(() => validateBlueprint(duration)).toThrow();
    const milestone = fixture(); milestone.milestones![0].taskKeys = [milestone.sprints[1].tasks[0].key!]; expect(() => validateBlueprint(milestone)).toThrow();
    const team = fixture(); team.recommendedTeamSize = 50; expect(() => validateBlueprint(team)).toThrow();
  });
});
