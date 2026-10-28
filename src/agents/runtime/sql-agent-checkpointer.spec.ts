import { emptyCheckpoint } from "@langchain/langgraph-checkpoint";
import { randomUUID } from "node:crypto";
import { AgentStateStore } from "./agent-state.store";
import { SqlAgentCheckpointer } from "./sql-agent-checkpointer";

describe("SQL checkpoint write budget", () => {
  it("persists the largest allowed write set with bounded database round trips", async () => {
    const query = jest.fn().mockResolvedValue([]);
    const assertLease = jest.fn().mockResolvedValue({});
    const state = {
      assertLease,
      db: {
        transaction: async (
          effect: (em: { query: typeof query }) => Promise<void>,
        ) => effect({ query }),
      },
    } as unknown as AgentStateStore;
    const lease = {
      runId: randomUUID(),
      owner: randomUUID(),
      actorId: randomUUID(),
    };
    const saver = new SqlAgentCheckpointer(state, lease);
    await saver.putWrites(
      {
        configurable: {
          thread_id: lease.runId,
          checkpoint_id: emptyCheckpoint().id,
        },
      },
      Array.from(
        { length: 128 },
        (_, index) => ["result", { index }] as [string, unknown],
      ),
      "task",
    );
    expect(assertLease).toHaveBeenCalledTimes(1);
    // One round trip for the entire atomic write set, independent of graph width.
    expect(query.mock.calls.length).toBeLessThanOrEqual(1);
    expect(query.mock.calls.length).toBeGreaterThan(0);
  });
});
