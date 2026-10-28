// Private fixture: only explicit disposable G1/CI databases, no network model or tracing.
const { DataSource } = require('typeorm');
const { ConfigService } = require('@nestjs/config');
const source = require('../../src/database/data-source').default;
const { AgentStateStore } = require('../../src/agents/runtime/agent-state.store');
const { AgentRuntimeService } = require('../../src/agents/runtime/agent-runtime.service');
const { AgentTelemetry } = require('../../src/agents/runtime/agent-telemetry.service');
const { KnowledgeAgentTools } = require('../../src/agents/runtime/knowledge-agent.tools');
const { KnowledgeRetrievalService } = require('../../src/knowledge/knowledge-retrieval.service');
const { PermissionsService } = require('../../src/rbac/permissions.service');
const { UserRole } = require('../../src/rbac/entities/user-role.entity');
const { GroupMember } = require('../../src/groups/entities/group-member.entity');
const { GroupRole } = require('../../src/groups/entities/group-role.entity');
const { Role } = require('../../src/rbac/entities/role.entity');
const { RolePermission } = require('../../src/rbac/entities/role-permission.entity');
const { Permission } = require('../../src/rbac/entities/permission.entity');
(async () => {
  const [actor, id, mode] = process.argv.slice(2), database = process.env.E2E_DB_NAME ?? '';
  if (!/^VIntern_E2E_(?:G1_\d+|CI_\d+_\d+)$/.test(database)) throw Error('Disposable database required.');
  const db = new DataSource({ ...source.options, database }); await db.initialize();
  try {
    const state = new AgentStateStore(db);
    const permissions = new PermissionsService(...[UserRole, GroupMember, GroupRole, Role, RolePermission, Permission].map(entity => db.getRepository(entity)));
    const ai = { modelName: 'test-only', generateStructuredWithRun: async ({ request }) => {
      if (mode === 'pause' && request.input.observations.length) { process.send('checkpointed'); await new Promise(() => undefined); }
      const raw = request.input.observations.length
        ? { action: 'final', toolName: 'none', query: '', answer: 'Chưa đủ nguồn để kết luận.', citationIds: [], insufficientEvidence: true }
        : { action: 'tool', toolName: 'career_role', query: '', answer: '', citationIds: [], insufficientEvidence: false };
      return { data: request.validate(raw), result: { inputTokens: 1, outputTokens: 1 } };
    } };
    await new AgentRuntimeService(state, new KnowledgeAgentTools(state, new KnowledgeRetrievalService(db, permissions)), ai,
      new AgentTelemetry(state, new ConfigService({ AGENT_LANGSMITH_ENABLED: 'false' }))).execute(actor, id);
    if ((await state.get(actor, id)).status !== 'succeeded') throw Error('Worker did not complete.');
  } finally { await db.destroy(); }
})().then(() => process.exit(0), () => process.exit(1));
