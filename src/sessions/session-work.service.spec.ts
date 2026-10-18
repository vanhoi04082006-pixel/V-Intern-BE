import { DataSource } from 'typeorm';
import { PermissionsService } from '../rbac/permissions.service';
import { TasksService } from '../tasks/tasks.service';
import { SessionsService } from './sessions.service';
import { SessionWorkService } from './session-work.service';

function harness() {
  const sessions = { getOne: jest.fn().mockResolvedValue({ id: 'session-1' }) };
  const tasks = { list: jest.fn().mockResolvedValue({ items: [{ id: 'task-1', status: 'review' }], total: 12 }) };
  const db = { query: jest.fn().mockResolvedValue([{ taskId: 'TASK-1', blocked: 1, submissionId: 'SUB-1', submissionStatus: 'submitted', prUrl: 'https://github.com/owner/repo/pull/1', headSha: 'abc', submittedAt: new Date(), instructorScore: null, instructorFeedback: null, aiStatus: 'needs_changes', aiScore: 50, aiSummary: 'Add tests' }]) };
  const permissions = { hasRole: jest.fn().mockResolvedValue(false) };
  const service = new SessionWorkService(sessions as unknown as SessionsService, tasks as unknown as TasksService, db as unknown as DataSource, permissions as unknown as PermissionsService);
  return { service, sessions, tasks, db };
}
describe('SessionWorkService', () => {
  const principal = { userId: 'teacher-1', email: 'teacher@example.test' };
  it('uses the route session and existing authorized task page before loading facts', async () => {
    const h = harness();
    const result = await h.service.list('session-1', { page: 2, pageSize: 10, sessionId: 'foreign' }, principal);
    expect(h.sessions.getOne).toHaveBeenCalledWith('session-1', { userId: 'teacher-1', isAdmin: false });
    expect(h.tasks.list).toHaveBeenCalledWith({ page: 2, pageSize: 10, sessionId: 'session-1' }, principal);
    expect(h.db.query.mock.calls[0][1]).toEqual(['session-1', 'task-1']);
    expect(result).toMatchObject({ total: 12, items: [{ id: 'task-1', delivery: { blocked: true, submission: { id: 'sub-1', status: 'submitted', aiStatus: 'needs_changes', aiScore: 50, instructorScore: null } } }] });
  });
  it('rejects an unowned session before loading task or submission facts', async () => {
    const h = harness(); h.sessions.getOne.mockRejectedValue(new Error('forbidden'));
    await expect(h.service.list('foreign', { page: 1, pageSize: 10 }, principal)).rejects.toThrow('forbidden');
    expect(h.tasks.list).not.toHaveBeenCalled(); expect(h.db.query).not.toHaveBeenCalled();
  });
  it('skips facts for an empty authorized page', async () => {
    const h = harness(); h.tasks.list.mockResolvedValue({ items: [], total: 0 });
    expect(await h.service.list('session-1', { page: 1, pageSize: 10 }, principal)).toEqual({ items: [], total: 0 });
    expect(h.db.query).not.toHaveBeenCalled();
  });
  it('paginates a timeline scoped by targets rather than actor membership', async () => {
    const h = harness();
    h.db.query.mockResolvedValueOnce([{ id: 'EVENT-1', summary: 'Reviewed' }]).mockResolvedValueOnce([{ total: 25 }]);
    expect(await h.service.timeline('session-1', { page: 2, pageSize: 10 }, principal)).toEqual({ items: [{ id: 'event-1', summary: 'Reviewed' }], total: 25 });
    expect(h.db.query.mock.calls[0][1]).toEqual(['session-1', 'teacher-1', 0, 10, 10]);
    expect(h.db.query.mock.calls[0][0]).toContain('ORDER BY e.createdAt DESC,e.id DESC OFFSET @3');
    expect(h.db.query.mock.calls[0][0]).toContain('s JOIN visibleTasks');
  });
  it('denies a foreign timeline before reading events', async () => {
    const h = harness(); h.sessions.getOne.mockRejectedValue(new Error('forbidden'));
    await expect(h.service.timeline('foreign', { page: 1, pageSize: 10 }, principal)).rejects.toThrow('forbidden');
    expect(h.db.query).not.toHaveBeenCalled();
  });
});
