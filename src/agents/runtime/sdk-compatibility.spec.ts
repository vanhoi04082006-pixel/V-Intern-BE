import { Annotation, END, MemorySaver, START, StateGraph } from '@langchain/langgraph';
import { tool } from 'langchain';
import { RunnableLambda } from '@langchain/core/runnables';
import { z } from 'zod';
import { AsyncLocalStorageProviderSingleton } from 'langsmith/singletons/traceable';

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
});
