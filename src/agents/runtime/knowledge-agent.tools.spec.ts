import { KnowledgeAgentTools } from './knowledge-agent.tools';
import { AgentStateStore } from './agent-state.store';
import { KnowledgeRetrievalService } from '../../knowledge/knowledge-retrieval.service';
import { validateAgentDecision } from '../definitions/knowledge-assistant.definition';
it('presents the same canonical citation ID in tool content and its evidence manifest', async () => {
  const state = { executeTool: async (_lease: unknown, _key: unknown, _tool: unknown, _args: unknown, effect: () => Promise<unknown>) => effect() } as unknown as AgentStateStore;
  const retrieval = { resolve: async () => ({}), search: async () => ({ policyVersion: 'v1', items: [{ id: 'uppercase-database-uuid', code: 'git-proof', version: 2,
    sha256: 'a'.repeat(64), title: 'Git', sources: [], content: 'git status', trust: 'reference_data' }] }) } as unknown as KnowledgeRetrievalService;
  const tools = new KnowledgeAgentTools(state, retrieval);
  const result = await tools.invoke({ runId: 'run', actorId: 'actor', owner: 'owner' }, undefined,
    validateAgentDecision({ action: 'tool', toolName: 'knowledge_search', query: 'Git', answer: '', citationIds: [], insufficientEvidence: false }), 'decision-1');
  expect((result.payload.items as Array<{ id: string }>).map(item => item.id)).toEqual(result.evidence.map(item => item.id));
  expect(result.evidence[0].id).toBe('k:git-proof@2');
});
