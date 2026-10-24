import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import source from '../src/database/data-source';
import { AppModule } from '../src/app.module';
import { ensureRbac } from '../src/bootstrap/ensure-rbac';
import { User } from '../src/users/entities/user.entity';
import { UserRole } from '../src/rbac/entities/user-role.entity';
import { Role } from '../src/rbac/entities/role.entity';
import { AI_PROVIDER_TOKEN, type AiStructuredRequest } from '../src/ai/ai-provider.interface';
import { AgentTelemetry } from '../src/agents/runtime/agent-telemetry.service';
import { AgentStateStore } from '../src/agents/runtime/agent-state.store';
let db: DataSource, app: INestApplication, admin: string, other: string, student: string;
const url = '/admin/agents/knowledge-runs';
beforeAll(async () => {
  const database = process.env.E2E_DB_NAME ?? '';
  if (!/^VIntern_E2E_(?:G1_\d+|CI_\d+_\d+)$/.test(database) || source.options.type !== 'mssql') throw Error('Disposable G1 SQL required.');
  db = new DataSource({ ...source.options, database }); await db.initialize(); await db.runMigrations({ transaction: 'all' }); await ensureRbac(db);
  const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(DataSource).useValue(db)
    .overrideProvider(AgentTelemetry).useValue(new AgentTelemetry(new AgentStateStore(db), new ConfigService({ AGENT_LANGSMITH_ENABLED: 'false' })))
    .overrideProvider(AI_PROVIDER_TOKEN).useValue({ name: 'test', model: 'test', generateStructured: async (input: AiStructuredRequest<unknown>) => ({
      data: input.validate((input.input.observations as unknown[]).length
        ? { action: 'final', toolName: 'none', query: '', answer: 'Chưa đủ nguồn.', citationIds: [], insufficientEvidence: true }
        : { action: 'tool', toolName: 'career_role', query: '', answer: '', citationIds: [], insufficientEvidence: false }), inputTokens: 1, outputTokens: 1, latencyMs: 1,
    }) }).compile();
  app = module.createNestApplication(); app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true })); await app.init();
  const tokens: string[] = [];
  for (const roleCode of ['admin', 'admin', 'intern']) {
    const id = randomUUID(), role = await db.getRepository(Role).findOneByOrFail({ code: roleCode });
    await db.getRepository(User).insert({ id, email: `${id}@g1.test`, username: id, displayName: 'G1 HTTP', passwordHash: 'not-a-login-hash', status: 'active' });
    await db.getRepository(UserRole).insert({ userId: id, roleId: role.id }); tokens.push(module.get(JwtService).sign({ sub: id }));
  }
  [admin, other, student] = tokens;
}, 120000);
afterAll(async () => { if (app) await app.close(); if (db?.isInitialized) await db.destroy(); });
it('enforces authentication, admin scope, strict input and a documented contract', async () => {
  const body = { requestId: randomUUID(), question: 'Kiểm tra Git' };
  await request(app.getHttpServer()).post(url).send(body).expect(401);
  await request(app.getHttpServer()).post(url).auth(student, { type: 'bearer' }).send(body).expect(403);
  await request(app.getHttpServer()).post(url).auth(admin, { type: 'bearer' }).send({ ...body, actorId: randomUUID() }).expect(400);
  const document = SwaggerModule.createDocument(app, new DocumentBuilder().build());
  expect(document.paths[url].post).toBeDefined(); expect(document.components?.schemas?.CreateKnowledgeAgentDto).toMatchObject({ required: ['requestId', 'question'] });
});
it('accepts a run, returns its real completion and blocks cross-user reads', async () => {
  const response = await request(app.getHttpServer()).post(url).auth(admin, { type: 'bearer' }).send({ requestId: randomUUID(), question: 'Kiểm tra Git' }).expect(202);
  const id = response.body.id;
  await request(app.getHttpServer()).get(`${url}/${id}`).auth(other, { type: 'bearer' }).expect(404);
  const deadline = Date.now() + 5000; let result;
  do { result = await request(app.getHttpServer()).get(`${url}/${id}`).auth(admin, { type: 'bearer' }).expect(200);
    if (['succeeded', 'failed'].includes(result.body.status)) break; await new Promise(resolve => setTimeout(resolve, 30));
  } while (Date.now() < deadline);
  expect(result?.body).toMatchObject({ status: 'succeeded', output: { insufficientEvidence: true } });
  await request(app.getHttpServer()).post(`${url}/${id}/resume`).auth(admin, { type: 'bearer' }).expect(409);
  expect(response.body).not.toHaveProperty('inputJson');
});
