import { HttpException, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { AsyncLocalStorageProviderSingleton } from 'langsmith/singletons/traceable';
import { AiService } from '../../ai/ai.service';
import { aiErrorCode, AiProviderTimeoutError, isRetryableAiError } from '../../ai/ai-errors';
import { withTimeout } from '../../ai/ai-retry';
import { AgentRuntimeError } from '../contracts/agent-errors';
import { agentDecisionJsonSchema, agentInputSchema, groundedOutput, knowledgeAssistant, KNOWLEDGE_ASSISTANT_PROMPT, validateAgentDecision,
  type AgentAnswer, type AgentDecision, type AgentObservation } from '../definitions/knowledge-assistant.definition';
import { AgentStateStore, type AgentRunRecord } from './agent-state.store';
import { SqlAgentCheckpointer } from './sql-agent-checkpointer';
import { KnowledgeAgentTools } from './knowledge-agent.tools';
import { AgentTelemetry } from './agent-telemetry.service';

const graphState = Annotation.Root({ question: Annotation<string>, observations: Annotation<AgentObservation[]>, decision: Annotation<AgentDecision>, answer: Annotation<AgentAnswer> });
const { budget } = knowledgeAssistant;
/** One read-only Agent is the acceptance slice. Existing business AIs migrate separately. */
@Injectable()
export class AgentRuntimeService implements OnModuleInit, OnModuleDestroy {
  private recovery?: ReturnType<typeof setInterval>;
  private readonly active = new Set<string>();
  constructor(private readonly state: AgentStateStore, private readonly tools: KnowledgeAgentTools, private readonly ai: AiService, private readonly telemetry: AgentTelemetry) {}
  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    this.recovery = setInterval(() => { void this.recover().catch(() => undefined); }, 15000);
    this.recovery.unref();
  }
  onModuleDestroy() { if (this.recovery) clearInterval(this.recovery); }
  async create(actor: string, raw: Record<string, unknown>) {
    const keys = Object.keys(raw);
    if (keys.some(key => !['requestId', 'question', 'roleCode'].includes(key)) || typeof raw.requestId !== 'string') throw new AgentRuntimeError('AGENT_INPUT_INVALID');
    const parsed = agentInputSchema.safeParse({ question: raw.question, ...(raw.roleCode === undefined ? {} : { roleCode: raw.roleCode }) });
    if (!parsed.success) throw new AgentRuntimeError('AGENT_INPUT_INVALID');
    await this.tools.authorize(actor, parsed.data.roleCode);
    const row = await this.state.create({ actorId: actor, requestId: raw.requestId, agentId: knowledgeAssistant.id, agentVersion: knowledgeAssistant.version,
      promptVersion: knowledgeAssistant.promptVersion, policyVersion: knowledgeAssistant.policyVersion, input: parsed.data });
    return this.view(row);
  }
  async get(actor: string, id: string) { await this.tools.authorize(actor); return this.view(await this.state.get(actor, id)); }
  async cancel(actor: string, id: string) { await this.tools.authorize(actor); return this.view(await this.state.cancel(actor, id)); }
  private view(row: AgentRunRecord) {
    return { id: row.id, requestId: row.requestId, agentId: row.agentId, agentVersion: row.agentVersion, status: row.status, steps: row.stepCount, attempts: row.attempts,
      inputTokens: row.inputTokens, outputTokens: row.outputTokens, errorCode: row.errorCode, retryable: row.retryable,
      output: row.outputJson ? JSON.parse(row.outputJson) as AgentAnswer : null, createdAt: row.createdAt, updatedAt: row.updatedAt, deadlineAt: row.deadlineAt };
  }
  async recover() {
    const rows = await this.state.recoverable();
    for (const row of rows) if (!this.active.has(row.id)) void this.execute(row.actorId, row.id).catch(() => undefined);
  }
  async execute(actor: string, id: string, resume = false) {
    const row = await this.state.get(actor, id), input = agentInputSchema.parse(JSON.parse(row.inputJson) as unknown);
    await this.tools.authorize(actor, input.roleCode);
    if (row.agentId !== knowledgeAssistant.id || row.agentVersion !== knowledgeAssistant.version || row.promptVersion !== knowledgeAssistant.promptVersion || row.policyVersion !== knowledgeAssistant.policyVersion) throw new AgentRuntimeError('AGENT_VERSION_UNAVAILABLE');
    const lease = await this.state.claim(id, 60000, resume); this.active.add(id);
    const heartbeat = setInterval(() => { void this.state.heartbeat(lease, 60000).catch(() => undefined); }, 10000); heartbeat.unref();
    const began = Date.now();
    try {
      await this.telemetry.record(id, 'started', { promptVersion: row.promptVersion, policyVersion: row.policyVersion, status: 'running' });
      const saver = new SqlAgentCheckpointer(this.state, lease), config = { configurable: { thread_id: id }, recursionLimit: budget.maxSteps + 2 };
      const builder = new StateGraph(graphState)
        .addNode('decide', async data => {
          await this.tools.authorize(actor, input.roleCode);
          const modelInput = { question: data.question, observations: data.observations };
          // UTF-8 bytes upper-bound ordinary tokenizer input; reserve every possible provider retry before spending.
          const reservation = (Buffer.byteLength(KNOWLEDGE_ASSISTANT_PROMPT + JSON.stringify(modelInput), 'utf8') + budget.maxOutputTokens) * (budget.maxRetries + 1);
          await this.state.consume(lease, budget, reservation);
          const result = await this.ai.generateStructuredWithRun({ feature: 'agent.knowledge-assistant', userId: actor, resourceType: 'agent_run', resourceId: id,
            promptVersion: row.promptVersion, maxRetries: budget.maxRetries, request: { task: 'knowledge-agent-decision', systemPrompt: KNOWLEDGE_ASSISTANT_PROMPT,
              input: modelInput, schemaName: 'AgentDecision', outputSchema: agentDecisionJsonSchema, validate: validateAgentDecision, modelOptions: { temperature: 0.1, maxOutputTokens: budget.maxOutputTokens } } });
          await this.state.recordUsage(lease, result.result.inputTokens, result.result.outputTokens);
          await this.telemetry.record(id, 'model', { model: this.ai.modelName, inputTokens: result.result.inputTokens, outputTokens: result.result.outputTokens, latencyMs: Date.now() - began });
          return { decision: validateAgentDecision(result.data) };
        })
        .addNode('read', async data => {
          if (data.observations.length >= budget.maxToolCalls) throw new AgentRuntimeError('AGENT_TOOL_BUDGET');
          await this.state.consume(lease, budget, 0);
          const observation = await this.tools.invoke(lease, input.roleCode, data.decision, `decision-${data.observations.length + 1}`);
          await this.telemetry.record(id, 'tool', { evidenceCount: observation.evidence.length, knowledgeHashes: observation.evidence.map(item => item.sha256) });
          return { observations: [...data.observations, observation] };
        })
        .addNode('finish', data => ({ answer: groundedOutput(data.decision, data.observations) }))
        .addEdge(START, 'decide').addConditionalEdges('decide', data => data.decision.action === 'tool' ? 'read' : 'finish', ['read', 'finish'])
        .addEdge('read', 'decide').addEdge('finish', END);
      const graph = builder.compile({ checkpointer: saver });
      const output = await new Promise<typeof graphState.State>((resolve, reject) => {
        AsyncLocalStorageProviderSingleton.getInstance().run({ tracingEnabled: false }, () => {
          void (async () => {
            const checkpoint = await saver.getTuple(config);
            return withTimeout(graph.invoke(checkpoint ? null : { question: input.question, observations: [] }, config), Math.max(1, Math.min(budget.maxDurationMs, new Date(row.deadlineAt).getTime() - Date.now())));
          })().then(resolve, reject);
        });
      });
      await this.state.complete(lease, output.answer);
      await this.telemetry.record(id, 'succeeded', { status: 'succeeded', latencyMs: Date.now() - began });
    } catch (error) {
      const current = await this.state.get(actor, id);
      if (current.status === 'cancelled') { await this.telemetry.record(id, 'cancelled', { status: 'cancelled' }); return; }
      if (current.status === 'succeeded') return; // A telemetry outage cannot turn a completed run into failure.
      const code = error instanceof AgentRuntimeError ? error.code : error instanceof AiProviderTimeoutError ? 'AGENT_TIMEOUT' : error instanceof HttpException ? 'AGENT_SCOPE_DENIED' : aiErrorCode(error);
      const retryable = isRetryableAiError(error);
      // A fenced worker may not overwrite its successor's state.
      if (current.leaseOwner?.toLowerCase() === lease.owner.toLowerCase()) {
        const expired = new Date(current.deadlineAt).getTime() <= Date.now();
        if (expired) await this.state.expire(lease); else await this.state.fail(lease, code, retryable);
        await this.telemetry.record(id, 'failed', { status: 'failed', errorCode: expired ? 'AGENT_RUN_EXPIRED' : code, latencyMs: Date.now() - began });
      }
    } finally { clearInterval(heartbeat); this.active.delete(id); }
  }
}
