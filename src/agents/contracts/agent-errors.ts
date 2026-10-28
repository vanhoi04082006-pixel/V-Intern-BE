export class AgentRuntimeError extends Error {
  constructor(readonly code: string, readonly retryable = false) { super(code); this.name = 'AgentRuntimeError'; }
}
