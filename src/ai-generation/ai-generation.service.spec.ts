import { AiGenerationService } from './ai-generation.service';
import { InternshipSession } from '../sessions/entities/internship-session.entity';

describe('AI detached completion lifecycle', () => {
  function fixture(status = 'generating', sessionStatus = 'active') {
    const session = { id: 'session', status: sessionStatus, startDate: new Date('2026-11-01'), endDate: new Date('2026-12-31') };
    const row = { id: 'plan', projectId: 'project', sessionId: session.id, status, templateVersion: null, draftJson: null, summaryJson: '{}' };
    const update = jest.fn(async () => ({ affected: 1 }));
    const batches = { save: jest.fn(async (v: unknown) => v), find: jest.fn(async () => [] as Array<{ draftJson: string }>), findOne: jest.fn(async () => ({ ...row })), update };
    const query = { setLock: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), getOneOrFail: jest.fn(async () => session) };
    const em = { getRepository: jest.fn((entity: unknown) => entity === InternshipSession ? { createQueryBuilder: () => query } : batches), query: jest.fn(async () => []) };
    const audit = { record: jest.fn(async () => undefined) };
    const service = Object.create(AiGenerationService.prototype);
    Object.assign(service, { batches, dataSource: { transaction: async (fn: (v: unknown) => unknown) => fn(em) }, audit,
      logger: { warn: jest.fn(), error: jest.fn() }, memberContext: jest.fn(async () => []),
      runGeneration: jest.fn(async () => ({ data: { sprints: [] } })) });
    return { service, session, row, batches, audit, update };
  }

  it('does not resurrect a generation already failed as stale', async () => {
    const f = fixture('failed');
    await f.service.runDetachedGeneration({ ...f.row, status: 'generating' }, {}, f.session, [], [], [], null, {}, {});
    expect(f.batches.save).not.toHaveBeenCalled();
    expect(f.update).not.toHaveBeenCalled();
    expect(f.audit.record).not.toHaveBeenCalled();
  });

  it('fails a late result when its session is no longer active', async () => {
    const f = fixture('generating', 'cancelled');
    await f.service.runDetachedGeneration(f.row, {}, { ...f.session, status: 'active' }, [], [], [], null, {}, {});
    expect(f.update).toHaveBeenCalledWith(f.row.id, expect.objectContaining({ status: 'failed', errorJson: expect.stringContaining('GENERATION_CONTEXT_CHANGED') }));
    expect(f.batches.save).not.toHaveBeenCalled();
  });

  it('keeps a persisted ready draft when audit logging fails', async () => {
    const f = fixture();
    f.audit.record.mockRejectedValueOnce(new Error('audit unavailable'));
    await f.service.runDetachedGeneration(f.row, {}, f.session, [], [], [], null, {}, {});
    expect(f.update).toHaveBeenCalledWith(f.row.id, expect.objectContaining({ status: 'ready' }));
    expect(f.update).not.toHaveBeenCalledWith(f.row.id, expect.objectContaining({ status: 'failed' }));
  });

  it('rejects a late draft generated for outdated session dates', async () => {
    const f = fixture();
    await f.service.runDetachedGeneration(f.row, {}, { ...f.session, endDate: new Date('2026-12-01') }, [], [], [], null, {}, {});
    expect(f.update).toHaveBeenCalledWith(f.row.id, expect.objectContaining({ status: 'failed', errorJson: expect.stringContaining('GENERATION_CONTEXT_CHANGED') }));
  });

  it('rejects a late draft generated for an outdated roster', async () => {
    const f = fixture();
    await f.service.runDetachedGeneration(f.row, {}, f.session, [{ userId: 'old-member', roleInProject: 'frontend' }], [], [], null, {}, {});
    expect(f.update).toHaveBeenCalledWith(f.row.id, expect.objectContaining({ status: 'failed' }));
  });

  it('allows the managing instructor with a mixed-case SQL UUID', async () => {
    const f = fixture();
    Object.assign(f.service, { projects: { findOne: async () => ({ id: 'project', mentorId: 'ABC-DEF' }) },
      sessions: { findOne: async () => f.session }, isSessionOwned: async () => true,
      dataSource: { query: async () => [] } });
    await expect(f.service.assertManaged('project', 'session', { userId: 'abc-def', isAdmin: false })).resolves.toHaveProperty('project');
  });

  it('does not warn that a mixed-case assignee is outside the roster', () => {
    const f = fixture();
    expect(f.service.roleFitWarnings({ sprints: [{ tasks: [{ title: 'Task', assigneeId: 'abc-def', suggestedRole: 'frontend' }] }] },
      [{ userId: 'ABC-DEF', roleInProject: 'frontend' }])).toEqual([]);
  });

  it('does not offer a newer generated draft after another plan was published', async () => {
    const f = fixture();
    f.batches.find.mockResolvedValueOnce([{ draftJson: '{"sprints":[]}' }]);
    await f.service.runDetachedGeneration(f.row, {}, f.session, [], [], [], null, {}, {});
    expect(f.update).toHaveBeenCalledWith(f.row.id, expect.objectContaining({ status: 'failed' }));
    expect(f.audit.record).not.toHaveBeenCalled();
  });

  it('rechecks project ownership inside the publish transaction', async () => {
    const f = fixture();
    const projectQuery = { setLock: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), getOneOrFail: async () => ({ mentorId: 'new-owner' }) };
    const em = { getRepository: () => ({ createQueryBuilder: () => projectQuery }), query: async () => [{ ok: 1 }] };
    await expect(f.service.assertLockedOwnership(em, 'project', { ...f.session, leadInstructorId: 'old-owner' }, { userId: 'old-owner', isAdmin: false }))
      .rejects.toMatchObject({ response: { code: 'SPRINT_SCOPE_FORBIDDEN' } });
  });

  it('rechecks session ownership inside the publish transaction', async () => {
    const f = fixture();
    const projectQuery = { setLock: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), getOneOrFail: async () => ({ mentorId: 'old-owner' }) };
    const em = { getRepository: () => ({ createQueryBuilder: () => projectQuery }), query: async () => [] };
    await expect(f.service.assertLockedOwnership(em, 'project', { ...f.session, leadInstructorId: 'new-owner' }, { userId: 'old-owner', isAdmin: false }))
      .rejects.toMatchObject({ response: { code: 'SPRINT_SCOPE_FORBIDDEN' } });
  });

  it('does not treat a failed generation request key as a successful publish replay', async () => {
    const f = fixture();
    Object.assign(f.service, { ownership: async () => undefined, assertManaged: async () => ({ project: { id: 'project' }, session: f.session }), lockRequest: async () => undefined });
    f.batches.findOne.mockResolvedValueOnce({ ...f.row, status: 'failed', projectId: 'project', summaryJson: '{}' });
    await expect(f.service.confirm({ projectId: 'project', sessionId: 'session', requestId: 'key',
      draft: { sprints: [{ name: 'Sprint', startDate: '2026-11-01', endDate: '2026-11-14', tasks: [] }] } }, {}))
      .rejects.toMatchObject({ response: { code: 'GENERATION_REQUEST_CONFLICT' } });
  });
});
