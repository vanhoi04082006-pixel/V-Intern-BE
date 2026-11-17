import { Annotation, END, MemorySaver, START, StateGraph } from '@langchain/langgraph';
import { tool } from 'langchain';
import { RunnableLambda } from '@langchain/core/runnables';
import { z } from 'zod';
import { AsyncLocalStorageProviderSingleton } from 'langsmith/singletons/traceable';
import { BusinessAgentEngine } from './business-agent-engine';
import { AgentStateStore } from './agent-state.store';
import { BusinessAgentScope } from './business-agent-scope.service';
import { AgentTelemetry } from './agent-telemetry.service';
import { KnowledgeRetrievalService } from '../../knowledge/knowledge-retrieval.service';
import { businessAgent } from '../definitions/business-agents';
import type { AiInvocation, AiTransport } from '../../ai/ai-invocation';
import type { AiRun } from '../../ai/entities/ai-run.entity';
import * as checkpointModule from './sql-agent-checkpointer';

describe('pinned Agent SDK compatibility with Nest CommonJS / Node22', () => {
  it('validates query-only tool arguments and structured output in an actual LangGraph', async () => {
    const invoked: string[] = [];
    const search = tool(async ({ query }) => { invoked.push(query); return { evidenceCount: 1 }; }, {
      name: 'knowledge_search', description: 'Read already authorized reference data.', schema: z.object({ query: z.string().min(1).max(1000) }).strict(),
    });
    await expect(search.invoke({ query: 'Git', actorId: 'forged' })).rejects.toThrow();
    const state = Annotation.Root({ query: Annotation<string>, evidenceCount: Annotation<number> });
    const builder = new StateGraph(state).addNode('tool', async data => search.invoke({ query: data.query }))
      .addEdge(START, 'tool').addEdge('tool', END);
    const graph = builder.compile({ checkpointer: new MemorySaver() });
    const output = z.object({ query: z.string(), evidenceCount: z.number().int().nonnegative() });
    const result = await graph.invoke({ query: 'Git' }, { configurable: { thread_id: 'sdk-spike-only' } });
    const validate = RunnableLambda.from((raw: unknown) => output.parse(raw));
    expect(await validate.invoke(result)).toEqual({ query: 'Git', evidenceCount: 1 });
    expect(invoked).toEqual(['Git']);
    const snapshot = await graph.getState({ configurable: { thread_id: 'sdk-spike-only' } });
    expect(snapshot.next).toEqual([]);
  });
  it('can disable automatic SDK traces locally without mutating process environment', async () => {
    const storage = AsyncLocalStorageProviderSingleton.getInstance();
    await new Promise<void>((resolve, reject) => storage.run({ tracingEnabled: false }, () => {
      Promise.resolve().then(() => {
        expect(storage.getStore()?.tracingEnabled).toBe(false); resolve();
      }).catch(reject);
    }));
  });
  it.each([true, false])('preserves opt-in thinking policy through the actual business Agent graph (low=%s)', async (lowThinking) => {
    const actor = '00000000-0000-4000-8000-000000000001';
    const resourceId = '00000000-0000-4000-8000-000000000002';
    const runId = '00000000-0000-4000-8000-000000000003';
    const owner = '00000000-0000-4000-8000-000000000004';
    const finalRun = { id: 'final-ai-run', status: 'succeeded', feature: 'ai-mentor', resourceId } as AiRun;
    const row = { id: runId, status: 'running', leaseOwner: owner, deadlineAt: new Date(Date.now() + 60000) };
    const state = {
      create: jest.fn().mockResolvedValue(row),
      claim: jest.fn().mockResolvedValue({ runId, owner, actorId: actor }),
      heartbeat: jest.fn().mockResolvedValue(undefined),
      consume: jest.fn().mockResolvedValue(undefined),
      recordUsage: jest.fn().mockResolvedValue(undefined),
      executeTool: jest.fn().mockImplementation(async (_lease, _key, _name, _args, effect: () => Promise<unknown>) => effect()),
      complete: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue(row),
      fail: jest.fn().mockResolvedValue(undefined),
      expire: jest.fn().mockResolvedValue(undefined),
      db: { getRepository: () => ({ findOneByOrFail: async () => finalRun }) },
    } as unknown as AgentStateStore;
    const scope = { resolve: jest.fn().mockResolvedValue({}) } as unknown as BusinessAgentScope;
    const retrieval = { searchAuthorizedScope: jest.fn().mockResolvedValue({ items: [] }) } as unknown as KnowledgeRetrievalService;
    const telemetry = { record: jest.fn().mockResolvedValue(undefined) } as unknown as AgentTelemetry;
    // Exercise the real graph and transport boundaries without a SQL fixture.
    const checkpoint = jest.spyOn(checkpointModule, 'SqlAgentCheckpointer').mockImplementation(() => new MemorySaver() as unknown as checkpointModule.SqlAgentCheckpointer);
    const calls = jest.fn(async (invocation: AiInvocation<unknown>) => {
      const decision = invocation.request.task === 'business-agent-decision';
      const observations = invocation.request.input.observations as unknown[] | undefined;
      const raw = decision
        ? observations?.length ? { action: 'final', query: '' } : { action: 'tool', query: 'Git input validation' }
        : { answer: 'Check the supplied contract.' };
      const data = invocation.request.validate(raw);
      return { data, run: finalRun, result: { data, provider: 'fixture', model: 'fixture', latencyMs: 1, inputTokens: 1, outputTokens: 1 } };
    });
    const invocation: AiInvocation<{ answer: string }> = {
      feature: 'ai-mentor', userId: actor, resourceType: 'ai_mentor_conversation', resourceId,
      promptVersion: 'thinking-propagation-test-v1',
      request: {
        task: 'ai-mentor', systemPrompt: 'Read authorized references only.', input: { question: 'How do I validate input?' }, schemaName: 'MentorAnswer',
        validate: raw => z.object({ answer: z.string() }).parse(raw),
        modelOptions: { temperature: 0.1, maxOutputTokens: 6000, ...(lowThinking ? { thinkingLevel: 'low' as const } : {}) },
      },
    };
    try {
      const result = await new BusinessAgentEngine(state, scope, retrieval, telemetry).run(businessAgent('ai-mentor')!, invocation, calls as AiTransport);
      expect(result.data.answer).toBe('Check the supplied contract.');
      const decisions = calls.mock.calls.map(([call]) => call).filter(call => call.request.task === 'business-agent-decision');
      expect(decisions).toHaveLength(2);
      for (const call of decisions) {
        expect(call.request.modelOptions).toEqual({ temperature: 0.1, maxOutputTokens: 256, ...(lowThinking ? { thinkingLevel: 'low' } : {}) });
      }
      const final = calls.mock.calls.map(([call]) => call).find(call => call.request.task === 'ai-mentor');
      expect(final?.request.modelOptions).toEqual(invocation.request.modelOptions);
    } finally {
      checkpoint.mockRestore();
    }
  });
});
