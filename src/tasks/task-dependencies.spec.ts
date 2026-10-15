import { EntityManager } from 'typeorm';
import { assertTaskDependencies } from './task-dependencies';
describe('task dependencies', () => {
  const task = { id: 'a', projectId: 'p' };
  function manager(status: string, sameProject = true) {
    return { query: jest.fn(async (sql: string) => sql.includes('OBJECT_ID') ? [{ id: 1 }]
      : sql.includes('task_specs') ? [{ specJson: JSON.stringify({ dependencies: [{ taskId: '11111111-1111-4111-8111-111111111111', key: 'api' }] }) }]
      : sameProject ? [{ id: '11111111-1111-4111-8111-111111111111', code: 'API-1', status }] : []) } as unknown as EntityManager;
  }
  it('blocks work until all prerequisites have teacher-approved Done state', async () => {
    await expect(assertTaskDependencies(manager('review'), task)).rejects.toMatchObject({ response: { code: 'TASK_DEPENDENCIES_PENDING' } });
    await expect(assertTaskDependencies(manager('done'), task)).resolves.toBeUndefined();
  });
  it('does not accept a missing or foreign dependency', async () => {
    await expect(assertTaskDependencies(manager('done', false), task)).rejects.toThrow();
  });
  it('preserves tasks in a legacy schema without specifications', async () => {
    const query = jest.fn(async () => []);
    await expect(assertTaskDependencies({ query } as unknown as EntityManager, task)).resolves.toBeUndefined();
    expect(query).toHaveBeenCalledTimes(1);
  });
});
