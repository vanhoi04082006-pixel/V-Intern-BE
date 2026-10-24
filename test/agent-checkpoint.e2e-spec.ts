import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { emptyCheckpoint } from '@langchain/langgraph-checkpoint';
import source from '../src/database/data-source';
import { User } from '../src/users/entities/user.entity';
import { AgentStateStore, type AgentLease } from '../src/agents/runtime/agent-state.store';
import { SqlAgentCheckpointer } from '../src/agents/runtime/sql-agent-checkpointer';
let db: DataSource, store: AgentStateStore, actor: string;
async function setup() {
  const run = await store.create({ actorId:actor,requestId:randomUUID(),agentId:'knowledge-assistant',agentVersion:'1',promptVersion:'test-v1',policyVersion:'test-v1',input:{question:'Git'} });
  const lease = await store.claim(run.id,30000);
  return {run,lease,config:{configurable:{thread_id:run.id}}};
}
beforeAll(async () => {
  const database = process.env.E2E_DB_NAME ?? '';
  if (!/^VIntern_E2E_(?:G1_\d+|CI_\d+_\d+)$/.test(database)||source.options.type!=='mssql') throw Error('Disposable G1 SQL required.');
  db = new DataSource({...source.options,database,synchronize:false,logging:false});await db.initialize();await db.runMigrations({transaction:'all'});
  actor=randomUUID();await db.getRepository(User).insert({id:actor,email:`${actor}@g1.test`,username:actor,displayName:'G1 checkpoint',passwordHash:'not-a-login-hash',status:'active'});
  store=new AgentStateStore(db);
},120000);
afterAll(async()=>{if(db?.isInitialized)await db.destroy();});
it('resumes a real LangGraph with a new saver without repeating its checkpointed model node',async()=>{
  const {lease,config}=await setup(),calls:string[]=[];
  const state=Annotation.Root({question:Annotation<string>,decision:Annotation<string>,answer:Annotation<string>});
  const build=(binding:AgentLease,paused=false)=>{
    const graph=new StateGraph(state).addNode('model',async()=>{calls.push('model');return{decision:'knowledge_search'};})
      .addNode('tool',async data=>{calls.push('tool');return{answer:`Saved decision: ${data.decision}`};})
      .addEdge(START,'model').addEdge('model','tool').addEdge('tool',END);
    return graph.compile({checkpointer:new SqlAgentCheckpointer(store,binding),...(paused?{interruptAfter:['model' as const]}:{})});
  };
  await build(lease,true).invoke({question:'Git'},config);
  expect(calls).toEqual(['model']);
  const resumed=await build(lease).invoke(null,config);
  expect(calls).toEqual(['model','tool']);expect(resumed.answer).toContain('knowledge_search');
  const saved=await build(lease).getState(config);expect(saved.next).toEqual([]);
});
it('keeps pending writes ordered and treats ordinary repeated writes as idempotent',async()=>{
  const {lease,config}=await setup(),saver=new SqlAgentCheckpointer(store,lease),checkpoint=emptyCheckpoint();
  const saved=await saver.put(config,checkpoint,{source:'input',step:-1,parents:{}},{});
  await saver.putWrites(saved,[['result','second']],'task-b','2');
  await saver.putWrites(saved,[['result','first']],'task-a','1');
  await saver.putWrites(saved,[['result','overwritten?']],'task-a','1');
  const tuple=await new SqlAgentCheckpointer(store,lease).getTuple(saved);
  expect(tuple?.pendingWrites).toEqual([['task-a','result','first'],['task-b','result','second']]);
  const listed=[];for await(const item of saver.list(config,{limit:1}))listed.push(item);
  expect(listed.length).toBe(1);
});
it('refuses a different thread, stale lease, deleted history and corrupted snapshot',async()=>{
  const {lease,config,run}=await setup(),saver=new SqlAgentCheckpointer(store,lease);
  await expect(saver.getTuple({configurable:{thread_id:randomUUID()}})).rejects.toMatchObject({code:'AGENT_CHECKPOINT_SCOPE'});
  const saved=await saver.put(config,emptyCheckpoint(),{source:'input',step:-1,parents:{}},{});
  await expect(saver.deleteThread(run.id)).rejects.toMatchObject({code:'AGENT_HISTORY_PRESERVED'});
  await db.query("UPDATE agent_checkpoints SET checkpointJson=N'{\"type\":\"json\",\"data\":\"e30=\"}' WHERE runId=@0",[run.id]);
  await expect(saver.getTuple(saved)).rejects.toMatchObject({code:'AGENT_STATE_INTEGRITY'});
  await store.cancel(actor,run.id);
  await expect(saver.putWrites(saved,[['result','late']],'task')).rejects.toMatchObject({code:'AGENT_LEASE_LOST'});
});
