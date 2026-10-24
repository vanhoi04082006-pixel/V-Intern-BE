import { BaseCheckpointSaver, compareWritesSortKeys, writesSortKey, WRITES_IDX_MAP, type Checkpoint, type CheckpointListOptions, type CheckpointMetadata, type CheckpointTuple, type ChannelVersions, type PendingWrite } from '@langchain/langgraph-checkpoint';
import type { RunnableConfig } from '@langchain/core/runnables';
import { AgentRuntimeError } from '../contracts/agent-errors';
import { AgentStateStore, stateHash, type AgentLease } from './agent-state.store';

interface CheckpointRow { checkpointId:string;parentId:string|null;checkpointJson:string;metadataJson:string;payloadHash:string }
interface WriteRow { taskId:string;taskPath:string;writeIndex:number;channel:string;valueJson:string;valueHash:string }
function invalid(code:string):never {throw new AgentRuntimeError(code);}

/** BaseCheckpointSaver contract pinned in ADR0001. Every I/O is bound to one server lease/thread. */
export class SqlAgentCheckpointer extends BaseCheckpointSaver {
  constructor(private readonly state:AgentStateStore,private readonly lease:AgentLease) {super();}
  private scope(config:RunnableConfig) {
    const thread:unknown=config.configurable?.thread_id;
    if(typeof thread!=='string'||thread.toLowerCase()!==this.lease.runId.toLowerCase())invalid('AGENT_CHECKPOINT_SCOPE');
    const namespace:unknown=config.configurable?.checkpoint_ns??'',id:unknown=config.configurable?.checkpoint_id;
    if(typeof namespace!=='string'||namespace.length>128||namespace.includes('\0'))invalid('AGENT_CHECKPOINT_SCOPE');
    if(id!==undefined&&(typeof id!=='string'||id.length>64||!id.length))invalid('AGENT_CHECKPOINT_SCOPE');
    return {namespace,id:id as string|undefined};
  }
  private config(namespace:string,id:string):RunnableConfig {return {configurable:{thread_id:this.lease.runId,checkpoint_ns:namespace,checkpoint_id:id}};}
  private async encode(value:unknown,max:number) {
    const [type,bytes]=await this.serde.dumpsTyped(value),text=JSON.stringify({type,data:Buffer.from(bytes).toString('base64')});
    if(text.length>max)invalid('AGENT_CHECKPOINT_BUDGET');return text;
  }
  private async decode<T>(text:string):Promise<T> {
    const envelope:unknown=JSON.parse(text);
    if(!envelope||typeof envelope!=='object'||!('type'in envelope)||!('data'in envelope)||typeof envelope.type!=='string'||typeof envelope.data!=='string')invalid('AGENT_STATE_INTEGRITY');
    const bytes=Buffer.from(envelope.data,'base64');
    if(bytes.toString('base64')!==envelope.data)invalid('AGENT_STATE_INTEGRITY');
    const value:unknown=await this.serde.loadsTyped(envelope.type,bytes);return value as T;
  }
  async getTuple(config:RunnableConfig):Promise<CheckpointTuple|undefined> {
    const {namespace,id}=this.scope(config);
    const saved=await this.state.db.transaction(async em=>{
      await this.state.assertLease(this.lease,em);
      const [row]:CheckpointRow[]=await em.query(`SELECT TOP (1) * FROM agent_checkpoints WHERE runId=@0 AND namespace=@1
        ${id?'AND checkpointId=@2':''} ORDER BY checkpointId DESC`,id?[this.lease.runId,namespace,id]:[this.lease.runId,namespace]);
      if(!row)return undefined;
      const writes:WriteRow[]=await em.query('SELECT * FROM agent_checkpoint_writes WHERE runId=@0 AND namespace=@1 AND checkpointId=@2',[this.lease.runId,namespace,row.checkpointId]);
      return {row,writes};
    });
    if(!saved)return undefined;
    const {row,writes}=saved;
    if(stateHash(row.checkpointJson+'\n'+row.metadataJson)!==row.payloadHash)invalid('AGENT_STATE_INTEGRITY');
    const pendingWrites:NonNullable<CheckpointTuple['pendingWrites']>=[];
    writes.sort((a,b)=>compareWritesSortKeys(writesSortKey(a.taskPath,a.taskId,a.writeIndex),writesSortKey(b.taskPath,b.taskId,b.writeIndex)));
    for(const write of writes){
      if(stateHash(write.valueJson)!==write.valueHash)invalid('AGENT_STATE_INTEGRITY');
      pendingWrites.push([write.taskId,write.channel,await this.decode(write.valueJson)]);
    }
    return {config:this.config(namespace,row.checkpointId),checkpoint:await this.decode<Checkpoint>(row.checkpointJson),metadata:await this.decode<CheckpointMetadata>(row.metadataJson),pendingWrites,
      ...(row.parentId?{parentConfig:this.config(namespace,row.parentId)}:{})};
  }
  async *list(config:RunnableConfig,options:CheckpointListOptions={}):AsyncGenerator<CheckpointTuple> {
    const {namespace}=this.scope(config),limit=options.limit??100,before=options.before?.configurable?.checkpoint_id;
    if(!Number.isInteger(limit)||limit<1||limit>100)invalid('AGENT_CHECKPOINT_BUDGET');
    if(options.before)this.scope(options.before);
    await this.state.assertLease(this.lease);
    const rows:Array<{checkpointId:string}>=await this.state.db.query(`SELECT TOP (100) checkpointId FROM agent_checkpoints WHERE runId=@0 AND namespace=@1
      ${before?'AND checkpointId<@2':''} ORDER BY checkpointId DESC`,before?[this.lease.runId,namespace,before]:[this.lease.runId,namespace]);
    let remaining=limit;
    for(const row of rows){
      const tuple=await this.getTuple(this.config(namespace,row.checkpointId));if(!tuple)continue;
      const fields:Record<string,unknown>={...tuple.metadata};
      if(options.filter&&!Object.entries(options.filter).every(([key,value])=>JSON.stringify(fields[key])===JSON.stringify(value)))continue;
      yield tuple;if(--remaining===0)break;
    }
  }
  async put(config:RunnableConfig,checkpoint:Checkpoint,metadata:CheckpointMetadata,_newVersions:ChannelVersions):Promise<RunnableConfig> {
    const {namespace,id:parentId}=this.scope(config);
    if(typeof checkpoint.id!=='string'||!checkpoint.id.length||checkpoint.id.length>64||checkpoint.id===parentId)invalid('AGENT_CHECKPOINT_SCOPE');
    const checkpointJson=await this.encode(checkpoint,512000),metadataJson=await this.encode(metadata,65536),hash=stateHash(checkpointJson+'\n'+metadataJson);
    await this.state.db.transaction(async em=>{
      await this.state.assertLease(this.lease,em);
      const [old]:Array<{payloadHash:string;parentId:string|null}>=await em.query('SELECT payloadHash,parentId FROM agent_checkpoints WITH(UPDLOCK,HOLDLOCK) WHERE runId=@0 AND namespace=@1 AND checkpointId=@2',[this.lease.runId,namespace,checkpoint.id]);
      if(old){if(old.payloadHash!==hash||(old.parentId??undefined)!==parentId)invalid('AGENT_CHECKPOINT_CONFLICT');return;}
      await em.query('INSERT INTO agent_checkpoints(runId,namespace,checkpointId,parentId,checkpointJson,metadataJson,payloadHash) VALUES(@0,@1,@2,@3,@4,@5,@6)',[this.lease.runId,namespace,checkpoint.id,parentId??null,checkpointJson,metadataJson,hash]);
    });
    return this.config(namespace,checkpoint.id);
  }
  async putWrites(config:RunnableConfig,writes:PendingWrite[],taskId:string,taskPath=''):Promise<void> {
    const {namespace,id}=this.scope(config);
    if(!id||typeof taskId!=='string'||taskId.length>128||typeof taskPath!=='string'||taskPath.length>512||writes.length>128)invalid('AGENT_CHECKPOINT_SCOPE');
    const prepared=await Promise.all(writes.map(async([channel,value],index)=>{
      if(typeof channel!=='string'||channel.length>128)invalid('AGENT_CHECKPOINT_SCOPE');
      return {channel,index:Object.hasOwn(WRITES_IDX_MAP,channel)?WRITES_IDX_MAP[channel]:index,valueJson:await this.encode(value,512000)};
    }));
    await this.state.db.transaction(async em=>{
      await this.state.assertLease(this.lease,em);
      for(const write of prepared){
        const parameters=[this.lease.runId,namespace,id,taskId,write.index,taskPath,write.channel,write.valueJson,stateHash(write.valueJson)];
        const [old]:Array<{present:number}>=await em.query('SELECT 1 present FROM agent_checkpoint_writes WITH(UPDLOCK,HOLDLOCK) WHERE runId=@0 AND namespace=@1 AND checkpointId=@2 AND taskId=@3 AND writeIndex=@4',parameters.slice(0,5));
        if(old){if(write.index<0)await em.query('UPDATE agent_checkpoint_writes SET taskPath=@5,channel=@6,valueJson=@7,valueHash=@8 WHERE runId=@0 AND namespace=@1 AND checkpointId=@2 AND taskId=@3 AND writeIndex=@4',parameters);}
        else await em.query('INSERT INTO agent_checkpoint_writes(runId,namespace,checkpointId,taskId,writeIndex,taskPath,channel,valueJson,valueHash) VALUES(@0,@1,@2,@3,@4,@5,@6,@7,@8)',parameters);
      }
    });
  }
  async deleteThread(threadId:string):Promise<void> {
    this.scope({configurable:{thread_id:threadId}});
    // No destructive runtime API: preserve provenance/checkpoints just as knowledge history is preserved.
    invalid('AGENT_HISTORY_PRESERVED');
  }
}
