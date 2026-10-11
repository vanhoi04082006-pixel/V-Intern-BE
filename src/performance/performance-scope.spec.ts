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

function harness() {
  const find = (rows: object[]) => ({ find: jest.fn().mockResolvedValue(rows) });
  const assignments = find(['owned','foreign'].map(projectId => ({internId:'student',projectId,sessionId:projectId,status:'active',assignedAt:new Date('2026-01-01'),completedAt:null})));
  const tasks = find(['owned','foreign'].map((projectId,i) => ({id:projectId,assigneeId:'student',projectId,status:i ? 'done':'todo',deletedAt:null,createdAt:new Date('2026-10-01'),dueDate:null,storyPoints:3})));
  const chain = {where:jest.fn().mockReturnThis(),andWhere:jest.fn().mockReturnThis(),orderBy:jest.fn().mockReturnThis(),getMany:jest.fn().mockResolvedValue([])};
  return new PerformanceService(assignments as unknown as Repository<Assignment>,find([]) as unknown as Repository<import('../sessions/entities/internship-session.entity').InternshipSession>,tasks as unknown as Repository<Task>,{createQueryBuilder:()=>chain} as unknown as Repository<TaskStatusHistory>,find([{internId:'student',projectId:'foreign',sessionId:'foreign',status:'finalized',overallScore:99,finalizedAt:new Date('2026-10-02')}]) as unknown as Repository<Evaluation>,find([]) as unknown as Repository<Sprint>,find([{id:'owned',mentorId:'teacher'},{id:'foreign',mentorId:'other'}]) as unknown as Repository<Project>,find([]) as unknown as Repository<SessionInstructor>,find([{id:'student',displayName:'Student'}]) as unknown as Repository<User>);
}
describe('performance ownership scope',()=>{
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
