import { Repository } from 'typeorm';
import { PerformanceService } from './performance.service';
import { Assignment } from '../assignments/entities/assignment.entity';
import { Task } from '../tasks/entities/task.entity';
import { TaskStatusHistory } from '../tasks/entities/task-status-history.entity';
import { Evaluation } from '../evaluation/entities/evaluation.entity';
import { Sprint } from '../sprints/entities/sprint.entity';
import { Project } from '../projects/entities/project.entity';
import { SessionInstructor } from '../sessions/entities/session-instructor.entity';
import { User } from '../users/entities/user.entity';

function harness(sharedProject = false, legacySprint = false) {
  const find = (rows: object[]) => ({ find: jest.fn().mockResolvedValue(rows) });
  const assignments = find(['owned','foreign'].map(projectId => ({internId:'student',projectId,sessionId:projectId,status:'active',assignedAt:new Date('2026-01-01'),completedAt:null})));
  const tasks = find(['owned','foreign'].map((projectId,i) => ({id:projectId,assigneeId:'student',projectId: sharedProject ? 'owned' : projectId,sprintId: `${projectId}-sprint`,status:i ? 'done':'todo',deletedAt:null,createdAt:new Date('2026-10-01'),dueDate:null,storyPoints:3})));
  const chain = {where:jest.fn().mockReturnThis(),andWhere:jest.fn().mockReturnThis(),orderBy:jest.fn().mockReturnThis(),getMany:jest.fn().mockResolvedValue([])};
  return new PerformanceService(assignments as unknown as Repository<Assignment>,find([]) as unknown as Repository<import('../sessions/entities/internship-session.entity').InternshipSession>,tasks as unknown as Repository<Task>,{createQueryBuilder:()=>chain} as unknown as Repository<TaskStatusHistory>,find([{internId:'student',projectId:'foreign',sessionId:'foreign',status:'finalized',overallScore:99,finalizedAt:new Date('2026-10-02')}]) as unknown as Repository<Evaluation>,find(['owned', 'foreign'].map(id => ({ id: `${id}-sprint`, projectId: sharedProject ? 'owned' : id, sessionId: legacySprint && id === 'foreign' ? null : id, status: 'planned' }))) as unknown as Repository<Sprint>,find([{id:'owned',mentorId:'teacher'},{id:'foreign',mentorId:'other'}]) as unknown as Repository<Project>,find([]) as unknown as Repository<SessionInstructor>,find([{id:'student',displayName:'Student'}]) as unknown as Repository<User>);
}
describe('performance ownership scope',()=>{
  it('does not attribute a legacy sprint without a session to a specific session', async () => {
    const metrics = await harness(true, true).getInternMetrics({ userId: 'admin', isAdmin: true }, 'student', { sessionId: 'owned' });
    expect(metrics.metrics.totalTaskCount).toBe(1);
  });
  it('does not include another session task in a session-specific performance report', async () => {
    const metrics = await harness(true).getInternMetrics({ userId: 'admin', isAdmin: true }, 'student', { sessionId: 'owned' });
    expect(metrics.metrics.totalTaskCount).toBe(1);
    expect(metrics.metrics.completedTaskCount).toBe(0);
  });
  it('loads task facts once for an entire intern list', async () => {
    const service = harness();
    const taskRepo = (service as unknown as { tasks: { find: jest.Mock } }).tasks;
    const assignmentRepo = (service as unknown as { assignments: { find: jest.Mock } }).assignments;
    assignmentRepo.find.mockResolvedValue(['one', 'two', 'three'].map(internId => ({ internId, projectId: 'owned', sessionId: 'owned', status: 'active', assignedAt: new Date('2026-01-01') })));
    await service.listInterns({ userId: 'teacher', isAdmin: false }, {});
    expect(taskRepo.find).toHaveBeenCalledTimes(1);
    expect(assignmentRepo.find).toHaveBeenCalledTimes(1);
  });
  it('does not aggregate another project merely because the same intern is visible',async()=>{
    const result=await harness().listInterns({userId:'teacher',isAdmin:false},{});
    expect(result.items[0]).toMatchObject({totalTaskCount:1,completedTaskCount:0,averageEvaluationScore:null});
  });
  it('enforces the same project boundary in member details',async()=>{
    const result=await harness().getInternMetrics({userId:'teacher',isAdmin:false},'student',{});
    expect(result.metrics.totalTaskCount).toBe(1);expect(result.metrics.averageEvaluationScore).toBeNull();
  });
  it('retains full aggregation for admins and the intern themself',async()=>{
    expect((await harness().listInterns({userId:'admin',isAdmin:true},{})).items[0].totalTaskCount).toBe(2);
    expect((await harness().ownMetrics('student',{})).metrics.totalTaskCount).toBe(2);
  });
});

 it('keeps all identity and ownership reads below SQL Server parameter limits for 2101 interns', async () => {
   const service = harness();
   const repos = service as unknown as Record<string, { find: jest.Mock }>;
   const ids = Array.from({ length: 2101 }, (_, i) => `id-${i}`);
   repos.assignments.find.mockResolvedValue(ids.map(id => ({ internId: id, projectId: id, sessionId: id, status: 'active', assignedAt: new Date('2026-01-01') })));
   const boundedIds = (query: { where: Record<string, { value: string[] }> }, key: string) => {
     const chunk = query.where[key].value;
     expect(chunk.length).toBeLessThanOrEqual(500);
     return chunk;
   };
   repos.users.find.mockImplementation(async q => boundedIds(q, 'id').map(id => ({ id, displayName: id })));
   repos.projects.find.mockImplementation(async q => boundedIds(q, 'id').map(id => ({ id, mentorId: 'teacher' })));
   repos.sessions.find.mockImplementation(async q => boundedIds(q, 'id').map(id => ({ id, leadInstructorId: 'teacher' })));
   repos.sessionInstructors.find.mockImplementation(async q => boundedIds(q, 'sessionId').map(id => ({ sessionId: id })));
   repos.tasks.find.mockResolvedValue([]);
   repos.evaluations.find.mockResolvedValue([]);
   repos.sprints.find.mockResolvedValue([]);
   const result = await service.listInterns({ userId: 'teacher', isAdmin: false }, {});
   expect(result.total).toBe(2101);
   expect(repos.users.find).toHaveBeenCalledTimes(5);
   expect(repos.sessionInstructors.find).toHaveBeenCalledTimes(5);
 });
