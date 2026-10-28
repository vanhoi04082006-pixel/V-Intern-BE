import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import source from '../src/database/data-source';
import { User } from '../src/users/entities/user.entity';
import { AgentStateStore } from '../src/agents/runtime/agent-state.store';
let db: DataSource, store: AgentStateStore, actor: string;
const request = () => ({ actorId: actor, requestId: randomUUID(), agentId: 'knowledge-assistant', agentVersion: '1', promptVersion: 'knowledge-assistant-v1', policyVersion: 'agent-runtime-v1', input: { question: 'Giải thích Git theo nguồn đã duyệt.', roleCode: null } });
beforeAll(async () => {
  const database = process.env.E2E_DB_NAME ?? '';
  if (!/^VIntern_E2E_(?:G1_\d+|CI_\d+_\d+)$/.test(database) || source.options.type !== 'mssql') throw Error('Disposable G1 SQL required.');
  db = new DataSource({ ...source.options, database, synchronize: false, logging: false }); await db.initialize(); await db.runMigrations({ transaction: 'all' });
  actor = randomUUID(); await db.getRepository(User).insert({ id: actor, email: `${actor}@g1.test`, username: actor, displayName: 'G1 state', passwordHash: 'not-a-login-hash', status: 'active' });
  await db.query('CREATE TABLE g1_effects (id uniqueidentifier NOT NULL PRIMARY KEY, note nvarchar(100) NOT NULL)');
  store = new AgentStateStore(db);
}, 120000);
afterAll(async () => { if (db?.isInitialized) await db.destroy(); });
it('creates a durable run idempotently and rejects reuse of a request key with different input', async () => {
  const input = request(), [a,b] = await Promise.all([store.create(input), store.create(input)]);
  expect(a.id).toBe(b.id); expect(a.status).toBe('queued');
  await expect(store.create({ ...input, input: { ...input.input, question: 'Khác' } })).rejects.toMatchObject({ code: 'AGENT_REQUEST_CONFLICT' });
  expect((await db.query('SELECT COUNT(*) count FROM agent_runs WHERE requestId=@0',[input.requestId]))[0].count).toBe(1);
});
it('allows one worker lease and fences a stale worker after lease expiry', async () => {
  const run = await store.create(request());
  const results = await Promise.allSettled([store.claim(run.id,1000),store.claim(run.id,1000)]);
  const successful = results.filter(result => result.status === 'fulfilled') as PromiseFulfilledResult<Awaited<ReturnType<AgentStateStore['claim']>>>[];
  expect(successful).toHaveLength(1); const old = successful[0].value;
  await new Promise(resolve => setTimeout(resolve,1100));
  const current = await store.claim(run.id,30000);
  expect(current.owner).not.toBe(old.owner);
  await expect(store.assertLease(old)).rejects.toMatchObject({ code: 'AGENT_LEASE_LOST' });
  await store.assertLease(current);
});
it('commits a SQL effect and its tool receipt together and replays once across store instances', async () => {
  const run = await store.create(request()), lease = await store.claim(run.id,30000), effect = randomUUID();
  const first = await store.executeTool(lease,'decision-1','test_sql_effect',{ note:'one' },async em => { await em.query('INSERT INTO g1_effects(id,note) VALUES(@0,@1)',[effect,'one']); return { effect }; });
  const restarted = new AgentStateStore(db), callback = jest.fn();
  const replayed = await restarted.executeTool(lease,'decision-1','test_sql_effect',{ note:'one' },callback);
  expect(replayed).toEqual(first); expect(callback).not.toHaveBeenCalled();
  expect((await db.query('SELECT COUNT(*) count FROM g1_effects WHERE id=@0',[effect]))[0].count).toBe(1);
  await expect(store.executeTool(lease,'decision-1','test_sql_effect',{ note:'changed' },callback)).rejects.toMatchObject({ code:'AGENT_TOOL_RECEIPT_CONFLICT' });
});
it('rolls back a failed tool effect without leaving a success receipt', async () => {
  const run = await store.create(request()), lease = await store.claim(run.id,30000), effect = randomUUID();
  await expect(store.executeTool(lease,'decision-1','test_sql_effect',{},async em => { await em.query('INSERT INTO g1_effects(id,note) VALUES(@0,@1)',[effect,'rollback']); throw Error('effect interrupted'); })).rejects.toThrow('effect interrupted');
  expect((await db.query('SELECT COUNT(*) count FROM g1_effects WHERE id=@0',[effect]))[0].count).toBe(0);
  expect((await db.query('SELECT COUNT(*) count FROM agent_tool_receipts WHERE runId=@0',[run.id]))[0].count).toBe(0);
});
it('persists finite step/token budgets and cancellation across a fresh store', async () => {
  const run = await store.create(request()), lease = await store.claim(run.id,30000);
  await store.consume(lease,{ maxSteps:2, maxTokens:100 },40);
  await new AgentStateStore(db).consume(lease,{ maxSteps:2,maxTokens:100 },40);
  await expect(store.consume(lease,{ maxSteps:2,maxTokens:100 },1)).rejects.toMatchObject({ code:'AGENT_STEP_BUDGET' });
  await store.cancel(actor,run.id);
  await expect(store.assertLease(lease)).rejects.toMatchObject({ code:'AGENT_LEASE_LOST' });
  expect((await store.get(actor,run.id)).status).toBe('cancelled');
  await expect(store.get(randomUUID(),run.id)).rejects.toMatchObject({ code:'AGENT_RUN_NOT_FOUND' });
});
it('retains the completed output and refuses to re-claim a terminal run', async () => {
  const run = await store.create(request()), lease = await store.claim(run.id,30000);
  await store.complete(lease,{ answer:'Có nguồn đã duyệt.', citations:[] });
  const result = await new AgentStateStore(db).get(actor,run.id);
  expect(result.status).toBe('succeeded'); expect(JSON.parse(result.outputJson!)).toMatchObject({ answer:'Có nguồn đã duyệt.' });
  await expect(store.claim(run.id,30000)).rejects.toMatchObject({ code:'AGENT_RUN_TERMINAL' });
});
