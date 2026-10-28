import { safeAgentEvent, AgentTelemetry } from './agent-telemetry.service';
import { ConfigService } from '@nestjs/config';
import { AgentStateStore } from './agent-state.store';
import { Client } from 'langsmith';
describe('Agent telemetry allowlist', () => {
  it('drops arbitrary private content, identifiers, URLs and provider errors', () => {
    const result = safeAgentEvent({ steps: 2, inputTokens: 40, latencyMs: 18, status: 'succeeded', errorCode: 'AGENT_TIMEOUT',
      password: 'private-password', question: 'private CV', apiKey: 'private-key', actorId: 'private-id',
      error: 'credentials in error body', model: 'https://private.example', knowledgeHashes: ['a'.repeat(64), 'private-text'] });
    expect(result).toEqual({ steps: 2, inputTokens: 40, latencyMs: 18, status: 'succeeded', errorCode: 'AGENT_TIMEOUT', knowledgeHashes: ['a'.repeat(64)] });
    expect(JSON.stringify(result)).not.toContain('private');
  });
  it('accepts only finite nonnegative counters and fixed provider identifiers', () => {
    expect(safeAgentEvent({ steps: -1, inputTokens: Infinity, latencyMs: NaN, model: 'gemini-2.5-flash', status: 'secret',
      promptVersion: 'knowledge-assistant-v1', policyVersion: 'agent-runtime-v1' })).toEqual({ model: 'gemini-2.5-flash', promptVersion: 'knowledge-assistant-v1', policyVersion: 'agent-runtime-v1' });
  });
  it('preserves local events when cloud delivery is unavailable without logging its raw error', async () => {
    const query = jest.fn().mockImplementation(async (sql: string) => sql.startsWith('SELECT') ? [{ createdAt: new Date('2026-10-24T01:00:00.000Z'), starts: 1 }] : []), cloud = jest.spyOn(Client.prototype, 'createRun').mockRejectedValue(Error('private transport details'));
    try {
      const telemetry = new AgentTelemetry({ db: { query } } as unknown as AgentStateStore,
        new ConfigService({ AGENT_LANGSMITH_ENABLED: 'true', LANGSMITH_API_KEY: 'test-key' }));
      await telemetry.record('A9B114D7-54EC-4DBA-9B65-00893EF47A47', 'failed', { errorCode: 'AGENT_TIMEOUT', password: 'private-password' });
      expect(cloud.mock.calls[0][0].trace_id).toBe('a9b114d7-54ec-4dba-9b65-00893ef47a47');
      expect(query.mock.calls[0][1][2]).toBe('failed');
      expect(JSON.parse(query.mock.calls[2][1][3])).toMatchObject({ accepted: false });
      expect(JSON.stringify(query.mock.calls)).not.toContain('private');
      expect(JSON.stringify(cloud.mock.calls)).not.toContain('private');
    } finally { cloud.mockRestore(); }
  });
});
