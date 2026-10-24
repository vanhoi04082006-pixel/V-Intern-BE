import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { Client } from 'langsmith';
import { AgentStateStore } from './agent-state.store';
import { knowledgeAssistant } from '../definitions/knowledge-assistant.definition';

const events = ['started', 'model', 'tool', 'succeeded', 'failed', 'cancelled'] as const;
type AgentEvent = typeof events[number];
/** LangSmith requires a dotted order with microsecond UTC timestamps when trace_id is supplied. */
const traceOrder = (time: number, id: string) => new Date(time).toISOString().replace(/[-:]/g, '').replace(/\.(\d{3})Z$/, '$1000Z') + id.toLowerCase();
/** Explicit payload boundary: never serialize a request, observation, answer or caught exception. */
export function safeAgentEvent(input: Record<string, unknown>): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  for (const key of ['steps', 'inputTokens', 'outputTokens', 'latencyMs', 'evidenceCount']) {
    const value = input[key];
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) safe[key] = value;
  }
  if (typeof input.status === 'string' && ['queued', 'running', 'succeeded', 'failed', 'cancelled'].includes(input.status)) safe.status = input.status;
  if (typeof input.errorCode === 'string' && /^(AGENT|AI|KNOWLEDGE)_[A-Z_]{1,55}$/.test(input.errorCode)) safe.errorCode = input.errorCode;
  if (typeof input.model === 'string' && /^gemini-[a-z0-9.-]{1,60}$/.test(input.model)) safe.model = input.model;
  if (input.promptVersion === knowledgeAssistant.promptVersion) safe.promptVersion = input.promptVersion;
  if (input.policyVersion === knowledgeAssistant.policyVersion) safe.policyVersion = input.policyVersion;
  if (Array.isArray(input.knowledgeHashes)) safe.knowledgeHashes = input.knowledgeHashes.filter((hash): hash is string => typeof hash === 'string' && /^[a-f0-9]{64}$/.test(hash)).slice(0, 15);
  return safe;
}

@Injectable()
export class AgentTelemetry {
  private readonly client: Client | null;
  private readonly project: string;
  constructor(private readonly state: AgentStateStore, config: ConfigService) {
    this.project = config.get<string>('LANGSMITH_PROJECT', 'vintern-local-g1');
    const key = config.get<string>('LANGSMITH_API_KEY'), endpoint = config.get<string>('LANGSMITH_ENDPOINT', 'https://api.smith.langchain.com');
    // Do not allow accidentally exporting telemetry to a user-controlled host.
    const allowed = ['https://api.smith.langchain.com', 'https://eu.api.smith.langchain.com', 'https://apac.api.smith.langchain.com', 'https://aws.api.smith.langchain.com'];
    this.client = config.get<string>('AGENT_LANGSMITH_ENABLED') === 'true' && key && allowed.includes(endpoint)
      ? new Client({ apiKey: key, apiUrl: endpoint, workspaceId: config.get<string>('LANGSMITH_WORKSPACE_ID'), autoBatchTracing: false, timeout_ms: 4000, callerOptions: { maxRetries: 0 }, omitTracedRuntimeInfo: true }) : null;
  }
  async record(runId: string, event: AgentEvent, input: Record<string, unknown> = {}) {
    if (!events.includes(event)) throw Error('Unsupported Agent telemetry event.');
    const safe = safeAgentEvent(input), id = randomUUID(), now = Date.now();
    await this.state.db.query('INSERT INTO agent_events(id,runId,eventType,metadataJson) VALUES(@0,@1,@2,@3)', [id, runId, event, JSON.stringify(safe)]);
    if (!this.client) return;
    let accepted = true, errorCode: string | null = null;
    try {
      const [root]: Array<{ createdAt: Date; starts: number }> = await this.state.db.query("SELECT createdAt,(SELECT COUNT(*) FROM agent_events WHERE runId=@0 AND eventType='started') starts FROM agent_runs WHERE id=@0", [runId]);
      const rootId = runId.toLowerCase(), rootOrder = traceOrder(new Date(root.createdAt).getTime(), rootId), isRoot = event === 'started' && root.starts === 1;
      await this.client.createRun({ id: isRoot ? rootId : id, trace_id: rootId, dotted_order: isRoot ? rootOrder : `${rootOrder}.${traceOrder(now, id)}`,
        ...(isRoot ? {} : { parent_run_id: rootId }), name: `vintern-agent-${event}`, run_type: 'chain', project_name: this.project,
        inputs: { agent: knowledgeAssistant.id, version: knowledgeAssistant.version }, outputs: safe,
        start_time: isRoot ? new Date(root.createdAt).getTime() : now, ...(isRoot ? {} : { end_time: now }), extra: { metadata: { correlationId: rootId, ...safe } } });
      if (['succeeded', 'failed', 'cancelled'].includes(event)) await this.client.updateRun(rootId, { end_time: now, outputs: safe });
    } catch (error) { accepted = false; errorCode = error && typeof error === 'object' && 'status' in error && typeof error.status === 'number' ? `HTTP_${error.status}` : 'TELEMETRY_UNAVAILABLE'; }
    await this.state.db.query('INSERT INTO agent_events(id,runId,eventType,metadataJson) VALUES(@0,@1,@2,@3)',
      [randomUUID(), runId, 'telemetry_delivery', JSON.stringify({ eventId: id, accepted, errorCode })]);
  }
}
