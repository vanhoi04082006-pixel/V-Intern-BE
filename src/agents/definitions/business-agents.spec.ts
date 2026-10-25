import {
  businessAgent,
  BUSINESS_AGENTS,
  validateBusinessDecision,
  businessRequestId,
} from "./business-agents";
describe("G2 business Agent registry and model decisions", () => {
  it("maps every existing workflow to one bounded, versioned Agent without a legacy-model fallback", () => {
    expect(BUSINESS_AGENTS).toHaveLength(11);
    for (const feature of [
      "interview_conversation",
      "interview_clarification",
      "recruitment-evaluation",
      "sprint-plan",
      "code_review",
      "ai-mentor",
      "recommendation",
      "evaluation-assistance",
      "replacement-advice",
    ]) {
      const definition = businessAgent(feature)!;
      expect(definition).toBeDefined();
      expect(definition.version).toBe("1");
      expect(definition.budget.maxToolCalls).toBe(2);
      expect(definition.tools).toEqual(["context_bundle"]);
    }
    expect(businessAgent("agent.knowledge-assistant")).toBeNull();
  });
  it("accepts only a query for the server-assigned tool or an explicit final decision", () => {
    expect(
      validateBusinessDecision({ action: "tool", query: "validation input" }),
    ).toEqual({ action: "tool", query: "validation input" });
    expect(
      validateBusinessDecision({ action: "final", query: "" }).action,
    ).toBe("final");
    for (const value of [
      { action: "tool", query: "" },
      { action: "shell", query: "pwd" },
      { action: "final", query: "extra" },
      { action: "tool", query: "hello", actor: "admin" },
    ])
      expect(() => validateBusinessDecision(value)).toThrow();
  });
  it("reuses an identical scoped call across restart and distinguishes changed context and schema repair", () => {
    const key = {
      actorId: "a",
      agentId: "reviewer",
      resourceId: "r",
      promptVersion: "v1",
      contextHash: "hash",
    };
    const id = businessRequestId(key);
    expect(id).toMatch(/^[a-f0-9-]{36}$/);
    expect(businessRequestId({ ...key })).toBe(id);
    expect(businessRequestId({ ...key, actorId: "b" })).not.toBe(id);
    expect(businessRequestId({ ...key, contextHash: "other" })).not.toBe(id);
    expect(businessRequestId({ ...key, promptVersion: "v1-repair1" })).not.toBe(
      id,
    );
  });
});
