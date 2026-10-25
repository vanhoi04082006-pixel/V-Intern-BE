import { randomUUID } from 'node:crypto';
import { hash } from 'bcryptjs';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { ensureRbac } from '../src/bootstrap/ensure-rbac';
import { User } from '../src/users/entities/user.entity';
import { Project } from '../src/projects/entities/project.entity';
import { Sprint } from '../src/sprints/entities/sprint.entity';
import { Task } from '../src/tasks/entities/task.entity';
import { Assignment } from '../src/assignments/entities/assignment.entity';
let app: INestApplication, db: DataSource, token: string, plannedId: string, completedId: string, foreignId: string, otherSessionId: string, ownTaskId: string;
beforeAll(async () => {
  if (!/^VIntern_E2E_CI_\d+_\d+$/.test(process.env.E2E_DB_NAME ?? '')) throw Error('Disposable SQL only');
  const module = await Test.createTestingModule({ imports:[AppModule] }).compile();app=module.createNestApplication({logger:false});
  app.setGlobalPrefix('api/v1');app.useGlobalPipes(new ValidationPipe({transform:true,whitelist:true,forbidNonWhitelisted:true}));await app.init();db=app.get(DataSource);await ensureRbac(db);
  const password = randomUUID(), user=await db.getRepository(User).save({email:`${randomUUID()}@sprint.test`,username:randomUUID(),displayName:'Sprint visibility QA',passwordHash:await hash(password,10),status:'active'});
  await db.query("INSERT INTO user_roles(userId,roleId) SELECT @0,id FROM roles WHERE code='intern'",[user.id]);
  await db.query("INSERT INTO recruitment_profiles(id,userId,selectedRole,status,attemptCount,recruitedAt) VALUES(NEWID(),@0,'frontend','passed',1,SYSUTCDATETIME())",[user.id]);
  const sessionId=randomUUID(), anotherSession=randomUUID();for(const id of [sessionId,anotherSession])await db.query("INSERT INTO internship_sessions(id,code,name,status,startDate,endDate) VALUES(@0,@0,'Sprint visibility','active',SYSUTCDATETIME(),DATEADD(day,30,SYSUTCDATETIME()))",[id]);
  const project=await db.getRepository(Project).save({code:randomUUID(),name:'Assigned project',description:'Synthetic SQL regression',status:'active'}),foreign=await db.getRepository(Project).save({code:randomUUID(),name:'Other project',description:'Synthetic SQL regression',status:'active'});
  await db.getRepository(Assignment).save({internId:user.id,projectId:project.id,sessionId,status:'active',assignedAt:new Date()});
  async function sprint(projectId:string,assignedSession:string,status:'planned'|'completed') {return db.getRepository(Sprint).save({code:randomUUID(),name:status==='planned'?'Planned but visible':'Completed history',projectId,sessionId:assignedSession,status,startDate:new Date(),endDate:new Date(Date.now()+86400000)});}
  const planned=await sprint(project.id,sessionId,'planned');plannedId=planned.id;completedId=(await sprint(project.id,sessionId,'completed')).id;foreignId=(await sprint(foreign.id,sessionId,'planned')).id;otherSessionId=(await sprint(project.id,anotherSession,'planned')).id;
  const own=await db.getRepository(Task).save({code:randomUUID(),title:'Only my task',projectId:project.id,sprintId:planned.id,assigneeId:user.id,status:'todo',priority:'medium'});ownTaskId=own.id;
  await db.getRepository(Task).save({code:randomUUID(),title:'Unassigned task must stay private',projectId:project.id,sprintId:planned.id,assigneeId:null,status:'todo',priority:'medium'});
  const login=await request(app.getHttpServer()).post('/api/v1/auth/login').send({email:user.email,password});expect(login.status).toBe(200);token=login.body.accessToken;
},120000);
afterAll(async()=>{if(app)await app.close();});
const read=(route:string)=>request(app.getHttpServer()).get('/api/v1'+route).set('Authorization',`Bearer ${token}`);
it('lists the planned sprint even though currentSprint is null, with completed history and no unrelated sessions',async()=>{
  const workspace=await read('/intern/me/workspace');expect(workspace.status).toBe(200);expect(workspace.body.currentSprint).toBeNull();expect(workspace.body.taskSummary.total).toBe(1);
  const list=await read('/intern/me/sprints');expect(list.status).toBe(200);expect(list.body.data.map((s:{id:string})=>s.id).sort()).toEqual([plannedId,completedId].map(id=>id.toLowerCase()).sort());expect(list.body.meta.total).toBe(2);
});
it('opens the planned sprint without activation and returns only the principal tasks',async()=>{
  const result=await read(`/intern/me/sprints/${plannedId}/board`);expect(result.status).toBe(200);expect(result.body.sprint.status).toBe('planned');expect(result.body.total).toBe(1);
  expect(result.body.columns.flatMap((column:{tasks:Array<{id:string}>})=>column.tasks).map((t:{id:string})=>t.id)).toEqual([ownTaskId]);
  expect((await db.getRepository(Sprint).findOneByOrFail({id:plannedId})).status).toBe('planned');
});
it('rejects other projects, other sessions, malformed IDs and forged identities',async()=>{
  for(const id of [foreignId,otherSessionId])expect((await read(`/intern/me/sprints/${id}/board`)).status).toBe(404);
  expect((await read('/intern/me/sprints/not-a-uuid/board')).status).toBe(400);
  expect((await read(`/intern/me/sprints/${plannedId}/board?assigneeId=${randomUUID()}`)).status).toBe(400);
  expect((await request(app.getHttpServer()).get('/api/v1/intern/me/sprints')).status).toBe(401);
});
