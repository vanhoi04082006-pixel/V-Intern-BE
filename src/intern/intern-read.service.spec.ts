import { InternReadService } from './intern-read.service';

describe('Intern assignment-scoped reads', () => {
  const workspace = jest.fn();
  const getOneDetailed = jest.fn();
  const board = jest.fn();
  const service = () => new InternReadService({ workspace } as never, { getOneDetailed } as never, { board } as never);
  beforeEach(() => jest.clearAllMocks());
  it('does not query projects when recruitment is blocked', async () => {
    workspace.mockResolvedValue({ status: 'recruitment_required', assignment: null });
    await expect(service().project('intern-a')).rejects.toMatchObject({ response: { code: 'ASSIGNMENT_NOT_ACTIVE' } });
    expect(getOneDetailed).not.toHaveBeenCalled();
  });
  it('only resolves the current principal assignment project', async () => {
    workspace.mockResolvedValue({ status: 'active', assignment: { project: { id: 'own-project' } } });
    getOneDetailed.mockResolvedValue({ id: 'own-project' });
    await expect(service().project('intern-a')).resolves.toEqual({ id: 'own-project' });
    expect(workspace).toHaveBeenCalledWith('intern-a');
    expect(getOneDetailed).toHaveBeenCalledWith('own-project');
  });
  it('never accepts another sprint or assignee', async () => {
    workspace.mockResolvedValue({ status: 'active', assignment: { project: { id: 'p' } }, currentSprint: { id: 'own-sprint' } });
    board.mockResolvedValue({ total: 1 });
    await service().sprintBoard('intern-a', { page: 2, pageSize: 10 });
    expect(board).toHaveBeenCalledWith('own-sprint', { page: 2, pageSize: 10 }, 'intern-a');
  });
  it('returns an honest missing-sprint error', async () => {
    workspace.mockResolvedValue({ status: 'active', assignment: { project: { id: 'p' } }, currentSprint: null });
    await expect(service().sprintBoard('intern-a', { page: 1, pageSize: 20 })).rejects.toMatchObject({ response: { code: 'CURRENT_SPRINT_NOT_FOUND' } });
    expect(board).not.toHaveBeenCalled();
  });
});
