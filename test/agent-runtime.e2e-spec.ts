import { randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import source from '../src/database/data-source';
import { ensureRbac } from '../src/bootstrap/ensure-rbac';
import { User } from '../src/users/entities/user.entity';
import { Role } from '../src/rbac/entities/role.entity';
import { UserRole } from '../src/rbac/entities/user-role.entity';
import { PermissionsService } from '../src/rbac/permissions.service';
import { GroupMember } from '../src/groups/entities/group-member.entity';
import { GroupRole } from '../src/groups/entities/group-role.entity';
import { RolePermission } from '../src/rbac/entities/role-permission.entity';
import { Permission } from '../src/rbac/entities/permission.entity';
import { KnowledgeRetrievalService } from '../src/knowledge/knowledge-retrieval.service';
import { AgentStateStore } from '../src/agents/runtime/agent-state.store';
import { AgentTelemetry } from '../src/agents/runtime/agent-telemetry.service';
import { KnowledgeAgentTools } from '../src/agents/runtime/knowledge-agent.tools';
import { AgentRuntimeService } from '../src/agents/runtime/agent-runtime.service';
import { AiService } from '../src/ai/ai.service';
import { AiProviderError } from '../src/ai/ai-errors';
import { fork } from 'child_process';
import { join } from 'path';
let db: DataSource, state: AgentStateStore, runtime: AgentRuntimeService, admin: string, other: string, student: string;
const model = jest.fn();
const decision = { action: 'tool', toolName: 'career_role', query: '', answer: '', citationIds: [], insufficientEvidence: false };
const answer = { action: 'final', toolName: 'none', query: '', answer: 'Chưa có tài liệu phù hợp để kết luận.', citationIds: [], insufficientEvidence: true };
beforeAll(async () => {
  const database = process.env.E2E_DB_NAME ?? '';
  if (!/^VIntern_E2E_(?:G1_\d+|CI_\d+_\d+)$/.test(database) || source.options.type !== 'mssql') throw Error('Disposable G1 SQL required.');
  db = new DataSource({ ...source.options, database, synchronize: false, logging: false }); await db.initialize(); await db.runMigrations({ transaction: 'all' }); await ensureRbac(db);
  const permissions = new PermissionsService(db.getRepository(UserRole), db.getRepository(GroupMember), db.getRepository(GroupRole), db.getRepository(Role), db.getRepository(RolePermission), db.getRepository(Permission));
  const actors: string[] = [];
  for (const roleCode of ['admin', 'admin', 'intern']) {
    const id = randomUUID(), role = await db.getRepository(Role).findOneByOrFail({ code: roleCode });
    await db.getRepository(User).insert({ id, email: `${id}@g1.test`, username: id, displayName: 'G1 runtime', passwordHash: 'not-a-login-hash', status: 'active' });
    await db.getRepository(UserRole).insert({ userId: id, roleId: role.id }); actors.push(id);
  }
  [admin, other, student] = actors; state = new AgentStateStore(db);
  runtime = new AgentRuntimeService(state, new KnowledgeAgentTools(state, new KnowledgeRetrievalService(db, permissions)),
    { generateStructuredWithRun: model, modelName: 'test-only' } as unknown as AiService, new AgentTelemetry(state, new ConfigService({ AGENT_LANGSMITH_ENABLED: 'false' })));
}, 120000);
afterAll(async () => { if (db?.isInitialized) await db.destroy(); });
beforeEach(() => model.mockReset().mockImplementation(async ({ request }: { request: { validate: (raw: unknown) => unknown; input: { observations: unknown[] } } }) => ({
  data: request.validate(request.input.observations.length ? answer : decision), result: { inputTokens: 20, outputTokens: 10, model: 'gemini-selected-by-admin', latencyMs: 123 }, run: { id: randomUUID() },
})));
const start = () => runtime.create(admin, { requestId: randomUUID(), question: 'Giải thích Git dựa trên tài liệu.' });
it('completes an actual durable graph, stores safe events and reuses an idempotent request', async () => {
  const input = { requestId: randomUUID(), question: 'Giải thích Git dựa trên tài liệu.' };
  const run = await runtime.create(admin, input); await runtime.execute(admin, run.id);
  const saved = await runtime.get(admin, run.id); expect(saved.status).toBe('succeeded'); expect(saved.output).toMatchObject({ insufficientEvidence: true });
  expect((await runtime.create(admin, input)).id).toBe(run.id);
  expect((await db.query('SELECT COUNT(*) count FROM agent_tool_receipts WHERE runId=@0', [run.id]))[0].count).toBe(1);
  const events = await db.query('SELECT metadataJson FROM agent_events WHERE runId=@0', [run.id]);
  expect(JSON.stringify(events)).not.toContain(input.question);
  const spans = await db.query("SELECT metadataJson FROM agent_events WHERE runId=@0 AND eventType='model'", [run.id]);
  expect(JSON.parse(spans[0].metadataJson)).toMatchObject({ model: 'gemini-selected-by-admin', latencyMs: 123 });
  expect(saved).not.toHaveProperty('inputJson'); expect(saved).not.toHaveProperty('leaseOwner');
});
it('rejects forged authority, students and cross-user reads/resume/cancel', async () => {
  await expect(runtime.create(student, { requestId: randomUUID(), question: 'Đọc tài liệu' })).rejects.toThrow();
  await expect(runtime.create(admin, { requestId: randomUUID(), question: 'Đọc tài liệu', actorId: other })).rejects.toThrow();
  const run = await start();
  await expect(runtime.get(other, run.id)).rejects.toThrow(); await expect(runtime.execute(other, run.id)).rejects.toThrow(); await expect(runtime.cancel(other, run.id)).rejects.toThrow();
});
it('fences concurrent workers and persists cancellation before any further tool execution', async () => {
  const run = await start(); await state.claim(run.id);
  await expect(runtime.execute(admin, run.id)).rejects.toMatchObject({ code: 'AGENT_RUN_BUSY' });
  await runtime.cancel(admin, run.id); expect((await runtime.get(admin, run.id)).status).toBe('cancelled'); expect(model).not.toHaveBeenCalled();
});
it.each([
  ['forbidden tool', { ...decision, toolName: 'shell' }, 'AGENT_TOOL_FORBIDDEN'],
  ['schema failure', { ...decision, actorId: 'forged' }, 'AGENT_DECISION_INVALID'],
  ['fabricated source', { ...answer, insufficientEvidence: false, citationIds: ['made-up'] }, 'AGENT_CITATION_INVALID'],
  ['missing source', { ...answer, insufficientEvidence: false }, 'AGENT_CITATION_REQUIRED'],
])('fails honestly on %s without fabricating success', async (_name, invalid, code) => {
  model.mockImplementation(async ({ request }) => ({ data: request.validate(request.input.observations.length ? invalid : decision), result: { inputTokens: 1, outputTokens: 1 } }));
  const run = await start(); await runtime.execute(admin, run.id);
  expect(await runtime.get(admin, run.id)).toMatchObject({ status: 'failed', errorCode: code, output: null });
});
it('limits an endlessly tool-calling model without weakening saved budgets', async () => {
  model.mockImplementation(async ({ request }) => ({ data: request.validate(decision), result: { inputTokens: 1, outputTokens: 1 } }));
  const run = await start(); await runtime.execute(admin, run.id);
  expect(await runtime.get(admin, run.id)).toMatchObject({ status: 'failed', errorCode: 'AGENT_TOOL_BUDGET' }); expect(model.mock.calls.length).toBeLessThanOrEqual(4);
});
it('keeps rate-limit failures retryable and resumes with a fresh worker', async () => {
  model.mockRejectedValueOnce(new AiProviderError('rate_limited', 'private provider text', { retryable: true }));
  const run = await start(); await runtime.execute(admin, run.id);
  expect(await runtime.get(admin, run.id)).toMatchObject({ status: 'failed', errorCode: 'AI_PROVIDER_RATE_LIMITED', retryable: true });
  await runtime.execute(admin, run.id, true); expect((await runtime.get(admin, run.id)).status).toBe('succeeded');
});
it('honors token reservations already consumed by an earlier worker', async () => {
  const run = await start(); await db.query('UPDATE agent_runs SET reservedTokens=64000 WHERE id=@0', [run.id]);
  await runtime.execute(admin, run.id);
  expect(await runtime.get(admin, run.id)).toMatchObject({ status: 'failed', errorCode: 'AGENT_TOKEN_BUDGET' }); expect(model).not.toHaveBeenCalled();
});
it('bounds a stalled provider by the durable deadline and never creates a success receipt', async () => {
  const run = await start(); await db.query('UPDATE agent_runs SET deadlineAt=DATEADD(second,1,SYSUTCDATETIME()) WHERE id=@0', [run.id]);
  model.mockImplementation(() => new Promise(() => undefined)); await runtime.execute(admin, run.id);
  expect(await runtime.get(admin, run.id)).toMatchObject({ status: 'failed', errorCode: 'AGENT_RUN_EXPIRED', output: null });
  expect((await db.query('SELECT COUNT(*) count FROM agent_tool_receipts WHERE runId=@0', [run.id]))[0].count).toBe(0);
});
it('does not execute a tool after cancellation while a provider response was in flight', async () => {
  const run = await start();
  model.mockImplementationOnce(async () => { await runtime.cancel(admin, run.id); return { data: decision, result: { inputTokens: 1, outputTokens: 1 } }; });
  await runtime.execute(admin, run.id); expect((await runtime.get(admin, run.id)).status).toBe('cancelled');
  expect((await db.query('SELECT COUNT(*) count FROM agent_tool_receipts WHERE runId=@0', [run.id]))[0].count).toBe(0);
});
it('resumes after forcibly killing an actual Node worker without duplicating its saved tool result', async () => {
  const run = await start(), fixture = join(__dirname, 'fixtures/agent-process.cjs');
  const launch = (mode: string) => fork(fixture, [admin, run.id, mode], { cwd: join(__dirname, '..'), execArgv: ['-r', 'ts-node/register'],
    env: { ...process.env, AGENT_LANGSMITH_ENABLED: 'false' }, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
  const worker = launch('pause');
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { worker.kill(); reject(Error('Worker did not reach its persisted tool checkpoint.')); }, 30000);
      worker.once('message', value => { clearTimeout(timer); if (value === 'checkpointed') resolve(); else reject(Error('Unexpected child result.')); });
      worker.once('exit', code => { clearTimeout(timer); if (code !== null) reject(Error('Worker exited before checkpoint.')); });
    });
    const stopped = new Promise<void>(resolve => worker.once('exit', () => resolve())); worker.kill('SIGKILL'); await stopped;
    await db.query('UPDATE agent_runs SET leaseExpiresAt=DATEADD(second,-1,SYSUTCDATETIME()) WHERE id=@0', [run.id]);
    const resumed = launch('finish');
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { resumed.kill(); reject(Error('Resume process timed out.')); }, 30000);
      resumed.once('exit', code => { clearTimeout(timer); if (code === 0) resolve(); else reject(Error('Resume worker failed.')); });
    });
    expect((await runtime.get(admin, run.id)).status).toBe('succeeded');
    expect((await db.query('SELECT COUNT(*) count FROM agent_tool_receipts WHERE runId=@0', [run.id]))[0].count).toBe(1);
    expect((await db.query("SELECT COUNT(*) count FROM agent_events WHERE runId=@0 AND eventType='tool'", [run.id]))[0].count).toBe(1);
  } finally { if (worker.exitCode === null) worker.kill(); }
}, 70000);
