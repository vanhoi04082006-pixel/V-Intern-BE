import { validateSprintPlan } from './sprint-plan.schema';

const sprint = (overrides: Record<string, unknown> = {}) => ({
  name: 'Sprint 1',
  goal: 'Onboard and scaffold',
  startDate: '2026-11-01T00:00:00.000Z',
  endDate: '2026-11-14T00:00:00.000Z',
  tasks: [
    {
      title: 'Setup repo',
      description: 'Init monorepo',
      priority: 'high',
      storyPoints: 3,
      dueDate: '2026-11-05T00:00:00.000Z',
      suggestedRole: 'backend',
    },
  ],
  ...overrides,
});

describe('validateSprintPlan', () => {
  it('preserves task outputs, estimates, skills, subtasks and milestone dependencies', () => {
    const plan = validateSprintPlan({ milestones: [{ key: 'm1', title: 'Ready for demo', dueDate: '2026-11-10', taskKeys: ['api', 'ui'] }], sprints: [sprint({ startDate: '2026-11-01', endDate: '2026-11-14', tasks: [
      { key: 'api', title: 'API', dueDate: '2026-11-04', expectedOutput: 'Validated endpoint', estimatedHours: 4, skillTags: ['REST'], complexity: 'beginner' },
      { key: 'ui', title: 'UI', parentKey: 'api', dueDate: '2026-11-08', dependsOn: ['api'] },
    ] })] });
    expect(plan.sprints[0].tasks[1]).toMatchObject({ key: 'ui', parentKey: 'api', dependsOn: ['api'] });
    expect(plan.milestones?.[0].taskKeys).toEqual(['api', 'ui']);
  });
  it.each([
    [{ key: 'a', title: 'A', dependsOn: ['unknown'] }],
    [{ key: 'a', title: 'A', dependsOn: ['b'] }, { key: 'b', title: 'B', dependsOn: ['a'] }],
    [{ key: 'a', title: 'A' }, { key: 'a', title: 'Duplicate' }],
    [{ key: 'a', title: 'A', parentKey: 'a' }],
  ])('rejects invalid or cyclic task references', (...tasks) => {
    expect(() => validateSprintPlan({ sprints: [sprint({ tasks })] })).toThrow();
  });
  it('retains bounded acceptance criteria and rejects malformed criteria', () => {
    const plan = validateSprintPlan({ sprints: [sprint({ tasks: [{ title: 'Task', acceptanceCriteria: [' Tests pass '] }] })] });
    expect(plan.sprints[0].tasks[0]).toMatchObject({ acceptanceCriteria: ['Tests pass'] });
    expect(() => validateSprintPlan({ sprints: [sprint({ tasks: [{ title: 'Task', acceptanceCriteria: [42] }] })] })).toThrow(/criteria/i);
  });
  it('accepts a well-formed plan and normalizes it', () => {
    const plan = validateSprintPlan({ sprints: [sprint(), sprint({ name: 'Sprint 2' })] });
    expect(plan.sprints).toHaveLength(2);
    expect(plan.sprints[0].tasks[0]).toMatchObject({ title: 'Setup repo', priority: 'high', storyPoints: 3 });
  });
  it('rejects empty plans and oversized ones', () => {
    expect(() => validateSprintPlan({ sprints: [] })).toThrow(/sprint/i);
    expect(() => validateSprintPlan({ sprints: Array.from({ length: 9 }, () => sprint()) })).toThrow(/sprint/i);
  });
  it('rejects bad dates, priorities and story points', () => {
    expect(() => validateSprintPlan({ sprints: [sprint({ startDate: 'not-a-date' })] })).toThrow(/date/i);
    expect(() => validateSprintPlan({ sprints: [sprint({ endDate: '2026-10-01T00:00:00.000Z' })] })).toThrow(/date/i);
    expect(() =>
      validateSprintPlan({ sprints: [sprint({ tasks: [{ title: 'T', priority: 'urgent' }] })] }),
    ).toThrow(/priority/i);
    expect(() =>
      validateSprintPlan({ sprints: [sprint({ tasks: [{ title: 'T', storyPoints: 9999 }] })] }),
    ).toThrow(/story points/i);
  });
  it('rejects non-objects, overlong strings and too many tasks', () => {
    expect(() => validateSprintPlan(null)).toThrow();
    expect(() => validateSprintPlan({ sprints: [sprint({ name: 'x'.repeat(300) })] })).toThrow(/256/);
    const many = Array.from({ length: 31 }, (_, i) => ({ title: `T${i}` }));
    expect(() => validateSprintPlan({ sprints: [sprint({ tasks: many })] })).toThrow(/task/i);
  });
  it('ignores unknown AI-invented fields instead of persisting them', () => {
    const plan = validateSprintPlan({ sprints: [sprint({ approved: true, score: 95 })] });
    expect(plan.sprints[0]).not.toHaveProperty('approved');
    expect(plan.sprints[0]).not.toHaveProperty('score');
  });
});
