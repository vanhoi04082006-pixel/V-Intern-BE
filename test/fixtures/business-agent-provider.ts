/** Test-only control decisions. Business payloads and failures stay in the original regression queues. */
export function scriptedBusinessDecision<T>(request: { task: string; input?: Record<string, unknown>; validate: (raw: unknown) => T }, provider: string, model: string) {
  if (request.task !== 'business-agent-decision') return null;
  const observations = request.input?.observations;
  const raw = Array.isArray(observations) && observations.length ? { action: 'final', query: '' } : { action: 'tool', query: 'kiểm chứng hợp đồng input' };
  return { data: request.validate(raw), provider, model, latencyMs: 1, inputTokens: 10, outputTokens: 10 };
}
