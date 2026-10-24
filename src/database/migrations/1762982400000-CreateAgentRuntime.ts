import { MigrationInterface, QueryRunner } from 'typeorm';

/** Runtime state, checkpoint and idempotency receipts share the existing SQL Server. No content seed. */
export class CreateAgentRuntime1762982400000 implements MigrationInterface {
  name = 'CreateAgentRuntime1762982400000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE agent_runs (
      id uniqueidentifier NOT NULL CONSTRAINT PK_agent_runs PRIMARY KEY,
      actorId uniqueidentifier NOT NULL, requestId uniqueidentifier NOT NULL, requestHash varchar(64) NOT NULL,
      agentId nvarchar(64) NOT NULL,agentVersion nvarchar(64) NOT NULL,promptVersion nvarchar(64) NOT NULL,policyVersion nvarchar(64) NOT NULL,
      status nvarchar(16) NOT NULL CONSTRAINT DF_agent_runs_status DEFAULT 'queued',
      inputJson nvarchar(max) NOT NULL,outputJson nvarchar(max) NULL,
      stepCount int NOT NULL CONSTRAINT DF_agent_runs_steps DEFAULT 0,
      reservedTokens int NOT NULL CONSTRAINT DF_agent_runs_reserved DEFAULT 0,
      inputTokens int NULL,outputTokens int NULL,
      attempts int NOT NULL CONSTRAINT DF_agent_runs_attempts DEFAULT 0,
      errorCode nvarchar(64) NULL,retryable bit NOT NULL CONSTRAINT DF_agent_runs_retryable DEFAULT 0,
      leaseOwner uniqueidentifier NULL,leaseExpiresAt datetime2 NULL,
      deadlineAt datetime2 NOT NULL CONSTRAINT DF_agent_runs_deadline DEFAULT DATEADD(minute,2,SYSUTCDATETIME()),
      createdAt datetime2 NOT NULL CONSTRAINT DF_agent_runs_created DEFAULT SYSUTCDATETIME(),
      updatedAt datetime2 NOT NULL CONSTRAINT DF_agent_runs_updated DEFAULT SYSUTCDATETIME(),
      CONSTRAINT UQ_agent_runs_request UNIQUE(actorId,requestId),
      CONSTRAINT FK_agent_runs_actor FOREIGN KEY(actorId) REFERENCES users(id),
      CONSTRAINT CK_agent_runs_status CHECK(status IN('queued','running','paused','succeeded','failed','cancelled')),
      CONSTRAINT CK_agent_runs_input CHECK(ISJSON(inputJson)=1 AND DATALENGTH(inputJson)<=16000),
      CONSTRAINT CK_agent_runs_output CHECK(outputJson IS NULL OR (ISJSON(outputJson)=1 AND DATALENGTH(outputJson)<=128000)),
      CONSTRAINT CK_agent_runs_budget CHECK(stepCount>=0 AND reservedTokens>=0 AND attempts BETWEEN 0 AND 3),
      CONSTRAINT CK_agent_runs_lease CHECK((leaseOwner IS NULL AND leaseExpiresAt IS NULL) OR (leaseOwner IS NOT NULL AND leaseExpiresAt IS NOT NULL))
    )`);
    await q.query('CREATE INDEX IX_agent_runs_recovery ON agent_runs(status,leaseExpiresAt,createdAt)');
    await q.query(`CREATE TABLE agent_checkpoints (
      runId uniqueidentifier NOT NULL,namespace nvarchar(128) NOT NULL,checkpointId nvarchar(64) NOT NULL,parentId nvarchar(64) NULL,
      checkpointJson nvarchar(max) NOT NULL,metadataJson nvarchar(max) NOT NULL,payloadHash varchar(64) NOT NULL,
      createdAt datetime2 NOT NULL CONSTRAINT DF_agent_checkpoints_created DEFAULT SYSUTCDATETIME(),
      CONSTRAINT PK_agent_checkpoints PRIMARY KEY(runId,namespace,checkpointId),
      CONSTRAINT FK_agent_checkpoints_run FOREIGN KEY(runId) REFERENCES agent_runs(id),
      CONSTRAINT CK_agent_checkpoints_data CHECK(ISJSON(checkpointJson)=1 AND ISJSON(metadataJson)=1 AND DATALENGTH(checkpointJson)<=1048576 AND DATALENGTH(metadataJson)<=131072)
    )`);
    await q.query(`CREATE TABLE agent_checkpoint_writes (
      runId uniqueidentifier NOT NULL,namespace nvarchar(128) NOT NULL,checkpointId nvarchar(64) NOT NULL,
      taskId nvarchar(128) NOT NULL,writeIndex int NOT NULL,taskPath nvarchar(512) NOT NULL,channel nvarchar(128) NOT NULL,valueJson nvarchar(max) NOT NULL,valueHash varchar(64) NOT NULL,
      CONSTRAINT PK_agent_checkpoint_writes PRIMARY KEY(runId,namespace,checkpointId,taskId,writeIndex),
      CONSTRAINT FK_agent_checkpoint_writes_run FOREIGN KEY(runId) REFERENCES agent_runs(id),
      CONSTRAINT CK_agent_checkpoint_writes_data CHECK(ISJSON(valueJson)=1 AND DATALENGTH(valueJson)<=1048576)
    )`);
    await q.query(`CREATE TABLE agent_tool_receipts (
      runId uniqueidentifier NOT NULL,callKey nvarchar(100) NOT NULL,toolName nvarchar(64) NOT NULL,argsHash varchar(64) NOT NULL,
      resultJson nvarchar(max) NOT NULL,resultHash varchar(64) NOT NULL,
      createdAt datetime2 NOT NULL CONSTRAINT DF_agent_tool_receipts_created DEFAULT SYSUTCDATETIME(),
      CONSTRAINT PK_agent_tool_receipts PRIMARY KEY(runId,callKey),
      CONSTRAINT FK_agent_tool_receipts_run FOREIGN KEY(runId) REFERENCES agent_runs(id),
      CONSTRAINT CK_agent_tool_receipts_json CHECK(ISJSON(resultJson)=1 AND DATALENGTH(resultJson)<=262144)
    )`);
    await q.query(`CREATE TABLE agent_events (
      id uniqueidentifier NOT NULL CONSTRAINT PK_agent_events PRIMARY KEY,runId uniqueidentifier NOT NULL,
      eventType nvarchar(64) NOT NULL,metadataJson nvarchar(max) NOT NULL,
      createdAt datetime2 NOT NULL CONSTRAINT DF_agent_events_created DEFAULT SYSUTCDATETIME(),
      CONSTRAINT FK_agent_events_run FOREIGN KEY(runId) REFERENCES agent_runs(id),
      CONSTRAINT CK_agent_events_json CHECK(ISJSON(metadataJson)=1 AND DATALENGTH(metadataJson)<=16000)
    )`);
    await q.query('CREATE INDEX IX_agent_events_run ON agent_events(runId,createdAt,id)');
  }
  async down(q: QueryRunner): Promise<void> {
    const [row]: Array<{ count: number }> = await q.query('SELECT COUNT(*) count FROM agent_runs WITH(TABLOCKX,HOLDLOCK)');
    if (row.count) throw Error('Preserve Agent runs, checkpoints and receipts before reverting the runtime schema.');
    for (const table of ['agent_events','agent_tool_receipts','agent_checkpoint_writes','agent_checkpoints','agent_runs']) await q.query(`DROP TABLE ${table}`);
  }
}
