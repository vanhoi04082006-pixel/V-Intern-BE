import { Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { DataSource, EntityManager } from 'typeorm';
import { AgentRuntimeError } from '../contracts/agent-errors';

export interface AgentRunRecord {
  id: string;actorId: string;requestId: string;requestHash: string;agentId: string;agentVersion: string;promptVersion: string;policyVersion: string;
  status: 'queued'|'running'|'paused'|'succeeded'|'failed'|'cancelled';inputJson: string;outputJson: string|null;
  stepCount: number;reservedTokens: number;inputTokens: number|null;outputTokens: number|null;attempts: number;
  errorCode: string|null;retryable: boolean;leaseOwner: string|null;leaseExpiresAt: Date|null;deadlineAt: Date;createdAt: Date;updatedAt: Date;
}
export interface AgentLease { runId: string;owner: string;actorId: string }
export interface CreateAgentState {
  actorId: string;requestId: string;agentId: string;agentVersion: string;promptVersion: string;policyVersion: string;input: Record<string,unknown>;
}
export const stateHash = (value: string) => createHash('sha256').update(value,'utf8').digest('hex');
const fail = (code: string): never => { throw new AgentRuntimeError(code); };
const uuid = (value: string) => /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value);
const json = (value: unknown,max: number) => { const text = JSON.stringify(value); if (!text || text.length>max || value===null || typeof value!=='object') fail('AGENT_STATE_INVALID'); return text; };

/** Trusted persistence port; actor/resource authorization belongs to the runtime service before calling it. */
@Injectable()
export class AgentStateStore {
  constructor(readonly db: DataSource) {}
  async create(input: CreateAgentState): Promise<AgentRunRecord> {
    if (!uuid(input.actorId)||!uuid(input.requestId)) fail('AGENT_INPUT_INVALID');
    const inputJson = json(input.input,8000), hash = stateHash(JSON.stringify({agentId:input.agentId,agentVersion:input.agentVersion,input:input.input}));
    return this.db.transaction(async em => {
      const [old]: AgentRunRecord[] = await em.query('SELECT * FROM agent_runs WITH(UPDLOCK,HOLDLOCK) WHERE actorId=@0 AND requestId=@1',[input.actorId,input.requestId]);
      if (old) { if (old.requestHash!==hash) fail('AGENT_REQUEST_CONFLICT'); return old; }
      const id = randomUUID();
      await em.query(`INSERT INTO agent_runs(id,actorId,requestId,requestHash,agentId,agentVersion,promptVersion,policyVersion,inputJson)
        VALUES(@0,@1,@2,@3,@4,@5,@6,@7,@8)`,[id,input.actorId,input.requestId,hash,input.agentId,input.agentVersion,input.promptVersion,input.policyVersion,inputJson]);
      return (await em.query('SELECT * FROM agent_runs WHERE id=@0',[id]))[0];
    });
  }
  async get(actorId: string,id: string): Promise<AgentRunRecord> {
    if (!uuid(id)||!uuid(actorId)) fail('AGENT_RUN_NOT_FOUND');
    const [row]: AgentRunRecord[] = await this.db.query('SELECT * FROM agent_runs WHERE id=@0 AND actorId=@1',[id,actorId]);
    if (!row) fail('AGENT_RUN_NOT_FOUND'); return row;
  }
  async claim(id: string,leaseMs=30000,resume=false): Promise<AgentLease> {
    if (!uuid(id)||!Number.isInteger(leaseMs)||leaseMs<1000||leaseMs>60000) fail('AGENT_INPUT_INVALID');
    return this.db.transaction(async em => {
      const [row]: Array<AgentRunRecord&{expired:number;activeLease:number}> = await em.query(`SELECT *,
        CASE WHEN deadlineAt<=SYSUTCDATETIME() THEN 1 ELSE 0 END expired,
        CASE WHEN leaseExpiresAt>SYSUTCDATETIME() THEN 1 ELSE 0 END activeLease
        FROM agent_runs WITH(UPDLOCK,HOLDLOCK) WHERE id=@0`,[id]);
      if (!row) fail('AGENT_RUN_NOT_FOUND');
      if (row.status==='succeeded'||row.status==='cancelled'||(row.status==='failed'&&(!resume||!row.retryable))) fail('AGENT_RUN_TERMINAL');
      if (row.expired) fail('AGENT_RUN_EXPIRED');
      if (row.status==='running'&&row.activeLease) fail('AGENT_RUN_BUSY');
      if (row.attempts>=3) fail('AGENT_RETRY_BUDGET');
      const owner = randomUUID();
      await em.query(`UPDATE agent_runs SET status='running',leaseOwner=@1,leaseExpiresAt=DATEADD(millisecond,@2,SYSUTCDATETIME()),
        attempts=attempts+1,errorCode=NULL,retryable=0,updatedAt=SYSUTCDATETIME() WHERE id=@0`,[id,owner,leaseMs]);
      return { runId:id,owner,actorId:row.actorId.toLowerCase() };
    });
  }
  async assertLease(lease: AgentLease,em: EntityManager=this.db.manager): Promise<AgentRunRecord> {
    const [row]: AgentRunRecord[] = await em.query(`SELECT * FROM agent_runs WITH(UPDLOCK,HOLDLOCK) WHERE id=@0 AND actorId=@1
      AND leaseOwner=@2 AND status='running' AND leaseExpiresAt>SYSUTCDATETIME() AND deadlineAt>SYSUTCDATETIME()`,[lease.runId,lease.actorId,lease.owner]);
    if (!row) fail('AGENT_LEASE_LOST'); return row;
  }
  async heartbeat(lease: AgentLease,leaseMs=30000) {
    return this.db.transaction(async em => { await this.assertLease(lease,em); await em.query('UPDATE agent_runs SET leaseExpiresAt=DATEADD(millisecond,@1,SYSUTCDATETIME()),updatedAt=SYSUTCDATETIME() WHERE id=@0',[lease.runId,leaseMs]); });
  }
  async consume(lease: AgentLease,budget:{maxSteps:number;maxTokens:number},tokens:number) {
    if (!Number.isInteger(tokens)||tokens<0) fail('AGENT_INPUT_INVALID');
    return this.db.transaction(async em => {
      const row = await this.assertLease(lease,em);
      if (row.stepCount>=budget.maxSteps) fail('AGENT_STEP_BUDGET');
      if (row.reservedTokens+tokens>budget.maxTokens) fail('AGENT_TOKEN_BUDGET');
      await em.query('UPDATE agent_runs SET stepCount=stepCount+1,reservedTokens=reservedTokens+@1,updatedAt=SYSUTCDATETIME() WHERE id=@0',[lease.runId,tokens]);
      return row.stepCount+1;
    });
  }
  async executeTool<T>(lease: AgentLease,callKey: string,toolName: string,args: unknown,effect:(em:EntityManager)=>Promise<T>): Promise<T> {
    const argsHash = stateHash(json(args,4000));
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(callKey)||!/^[a-z0-9_]{1,64}$/.test(toolName)) fail('AGENT_INPUT_INVALID');
    return this.db.transaction(async em => {
      await this.assertLease(lease,em);
      const [old]: Array<{toolName:string;argsHash:string;resultJson:string;resultHash:string}> = await em.query('SELECT * FROM agent_tool_receipts WITH(UPDLOCK,HOLDLOCK) WHERE runId=@0 AND callKey=@1',[lease.runId,callKey]);
      if (old) {
        if (old.toolName!==toolName||old.argsHash!==argsHash) fail('AGENT_TOOL_RECEIPT_CONFLICT');
        if (stateHash(old.resultJson)!==old.resultHash) fail('AGENT_STATE_INTEGRITY');
        return JSON.parse(old.resultJson) as T;
      }
      const result = await effect(em), resultJson = json(result,131072);
      await em.query('INSERT INTO agent_tool_receipts(runId,callKey,toolName,argsHash,resultJson,resultHash) VALUES(@0,@1,@2,@3,@4,@5)',[lease.runId,callKey,toolName,argsHash,resultJson,stateHash(resultJson)]);
      return result;
    });
  }
  async complete(lease: AgentLease,output: unknown) {
    const outputJson = json(output,64000);
    await this.db.transaction(async em => {
      await this.assertLease(lease,em);
      await em.query("UPDATE agent_runs SET status='succeeded',outputJson=@1,leaseOwner=NULL,leaseExpiresAt=NULL,updatedAt=SYSUTCDATETIME() WHERE id=@0",[lease.runId,outputJson]);
    });
  }
  async recordUsage(lease: AgentLease,input: number|null,output: number|null) {
    const valid = (value:number|null) => value===null || (Number.isSafeInteger(value)&&value>=0);
    if (!valid(input)||!valid(output)) fail('AGENT_USAGE_INVALID');
    await this.db.transaction(async em => {
      await this.assertLease(lease,em);
      await em.query('UPDATE agent_runs SET inputTokens=CASE WHEN @1 IS NULL THEN inputTokens ELSE COALESCE(inputTokens,0)+@1 END,outputTokens=CASE WHEN @2 IS NULL THEN outputTokens ELSE COALESCE(outputTokens,0)+@2 END WHERE id=@0',[lease.runId,input,output]);
    });
  }
  async fail(lease: AgentLease,code:string,retryable=false) {
    if (!/^[A-Z0-9_]{1,64}$/.test(code)) fail('AGENT_INPUT_INVALID');
    await this.db.transaction(async em => { await this.assertLease(lease,em); await em.query("UPDATE agent_runs SET status='failed',errorCode=@1,retryable=@2,leaseOwner=NULL,leaseExpiresAt=NULL,updatedAt=SYSUTCDATETIME() WHERE id=@0",[lease.runId,code,retryable]); });
  }
  async expire(lease: AgentLease) {
    // The executor's hard timer has fired. Do not re-check a second machine's clock here:
    // millisecond rounding/skew could leave an expired execution marked running. Fencing still applies.
    await this.db.query("UPDATE agent_runs SET status='failed',errorCode='AGENT_RUN_EXPIRED',retryable=0,leaseOwner=NULL,leaseExpiresAt=NULL,updatedAt=SYSUTCDATETIME() WHERE id=@0 AND actorId=@1 AND leaseOwner=@2 AND status='running'",[lease.runId,lease.actorId,lease.owner]);
  }
  async cancel(actorId:string,id:string) {
    await this.get(actorId,id);
    await this.db.query("UPDATE agent_runs SET status='cancelled',leaseOwner=NULL,leaseExpiresAt=NULL,updatedAt=SYSUTCDATETIME() WHERE id=@0 AND actorId=@1 AND status NOT IN('succeeded','cancelled')",[id,actorId]);
    return this.get(actorId,id);
  }
  async recoverable() {
    await this.db.query("UPDATE agent_runs SET status='failed',errorCode='AGENT_RUN_EXPIRED',retryable=0,leaseOwner=NULL,leaseExpiresAt=NULL WHERE deadlineAt<=SYSUTCDATETIME() AND status IN('queued','running','paused')");
    return this.db.query("SELECT TOP (4) id,actorId FROM agent_runs WHERE agentId='knowledge-assistant' AND deadlineAt>SYSUTCDATETIME() AND (status='queued' OR (status='running' AND leaseExpiresAt<=SYSUTCDATETIME())) ORDER BY createdAt,id") as Promise<Array<{id:string;actorId:string}>>;
  }
}
