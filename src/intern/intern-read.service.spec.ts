import { InternReadService } from './intern-read.service';

describe('Intern assignment-scoped reads', () => {
  const workspace = jest.fn();
  const getOneDetailed = jest.fn();
  const board = jest.fn();
  const listForAssignment = jest.fn(), sprintDetails = jest.fn();
  const service = () => new InternReadService({ workspace } as never, { getOneDetailed } as never, { board, listForAssignment, getOneDetailed: sprintDetails } as never);
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
  it('lists planned and completed sprints from the principal assignment without requiring an active sprint', async () => {
    workspace.mockResolvedValue({status:'active',assignment:{project:{id:'p'},session:{id:'session'}},currentSprint:null});
    listForAssignment.mockResolvedValue({items:[{id:'planned',status:'planned'},{id:'completed',status:'completed'}],total:2});
    await expect(service().sprints('intern-a',{page:1,pageSize:20})).resolves.toMatchObject({total:2});
    expect(listForAssignment).toHaveBeenCalledWith('p','session',{page:1,pageSize:20});
  });
  it('opens a selected planned sprint with only the authenticated student tasks', async () => {
    workspace.mockResolvedValue({status:'active',assignment:{project:{id:'p'},session:{id:'session'}},currentSprint:null});
    sprintDetails.mockResolvedValue({id:'planned',projectId:'p',sessionId:'session',status:'planned'});
    await service().selectedSprintBoard('intern-a','planned',{page:1,pageSize:20});
    expect(board).toHaveBeenCalledWith('planned',{page:1,pageSize:20},'intern-a');
  });
  it.each([{projectId:'foreign',sessionId:'session'},{projectId:'p',sessionId:'other-session'}])('rejects a selected sprint outside the assignment %j',async foreign=>{
    workspace.mockResolvedValue({status:'active',assignment:{project:{id:'p'},session:{id:'session'}}});sprintDetails.mockResolvedValue(foreign);
    await expect(service().selectedSprintBoard('intern-a','foreign',{page:1,pageSize:20})).rejects.toMatchObject({status:404});expect(board).not.toHaveBeenCalled();
  });
});
