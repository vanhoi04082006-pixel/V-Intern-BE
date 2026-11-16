import { IntakeAgents } from './intake-agents.service';
import { AiService } from '../ai/ai.service';

describe('CV Agent citation recovery', () => {
  const segments = [{ ref: 'page:1', text: 'Built React applications with TypeScript.' }];
  const valid = { confidence: 0.8, missing: [], facts: [{ skill: 'React', ref: 'page:1', quote: 'React applications' }] };
  const invalid = { ...valid, facts: [{ skill: 'SQL', ref: 'page:1', quote: 'Five years of SQL' }] };
  const setup = (values: unknown[]) => {
    const generate = jest.fn().mockImplementation(async params => {
      const value = values.shift();
      if (value instanceof Error) throw value;
      return { data: params.request.validate(value) };
    });
    return { generate, agent: new IntakeAgents({ generateStructuredWithRun: generate } as unknown as AiService) };
  };
  it('asks the real Agent again once after an unsupported citation, preserving source and workflow attempt', async () => {
    const { agent, generate } = setup([invalid, valid]);
    await expect(agent.analyze('actor', 'application', 4, segments, 2)).resolves.toEqual(valid);
    expect(generate).toHaveBeenCalledTimes(2);
    const first = generate.mock.calls[0][0], repaired = generate.mock.calls[1][0];
    expect(first.request.input.segments).toEqual(segments);
    expect(repaired.request.input.segments).toEqual(segments);
    expect(repaired.request.input.processingAttempt).toBe(2);
    expect(repaired.request.input.citationRepairAttempt).toBe(1);
    expect(repaired.request.systemPrompt).toContain('CV_EVIDENCE_INVALID');
    expect(JSON.stringify(repaired.request.input)).not.toContain('Five years of SQL');
    expect(repaired.promptVersion).toBe('cv-analysis-v2');
  });
  it('fails closed after a second unsupported citation without filtering, inventing or accepting facts', async () => {
    const { agent, generate } = setup([invalid, invalid, valid]);
    await expect(agent.analyze('actor', 'application', 1, segments)).rejects.toThrow('CV_EVIDENCE_INVALID');
    expect(generate).toHaveBeenCalledTimes(2);
  });
  it('does not repeat a valid extraction', async () => {
    const { agent, generate } = setup([valid]);
    await expect(agent.analyze('actor', 'application', 1, segments)).resolves.toEqual(valid);
    expect(generate).toHaveBeenCalledTimes(1);
  });
  it('requests low thinking for the three intake stages without increasing their output cap', async () => {
    const slotId = '00000000-0000-4000-8000-000000000001';
    const { agent, generate } = setup([
      valid,
      { roleCode: 'frontend', factIndexes: [0], confidence: 0.8, reason: 'React applications is direct evidence.' },
      { slotId, reason: 'First available open slot.' },
    ]);

    await agent.analyze('actor', 'application', 1, segments);
    await agent.match('actor', 'application', 1, valid, [{ code: 'frontend', name: 'Frontend', requiredSkillsJson: '["React"]', description: 'Build web interfaces.' }]);
    await agent.coordinate('actor', 'application', 1, 'frontend', [{ id: slotId, startsAt: new Date('2026-11-17T02:00:00Z'), endsAt: new Date('2026-11-17T03:00:00Z'), timezone: 'Asia/Bangkok', credentialsLeadMinutes: 15, minimumPreparationMinutes: 30 }]);

    expect(generate.mock.calls.map(([params]) => params.feature)).toEqual(['cv-analysis', 'cv-role-match', 'interview-coordination']);
    for (const [params] of generate.mock.calls) {
      expect(params.request.modelOptions).toEqual({ temperature: 0.1, maxOutputTokens: 6000, thinkingLevel: 'low' });
    }
  });
  it('does not add another retry for a provider or authorization error', async () => {
    const { agent, generate } = setup([new Error('AGENT_SCOPE_DENIED'), valid]);
    await expect(agent.analyze('actor', 'application', 1, segments)).rejects.toThrow('AGENT_SCOPE_DENIED');
    expect(generate).toHaveBeenCalledTimes(1);
  });
  it('sends the same string and collection limits to Gemini that the server enforces, and repairs too-short evidence once', async () => {
    const short = { ...valid, facts: [{ skill: 'CSS3', ref: 'page:1', quote: 'CSS3' }] };
    const { agent, generate } = setup([short, valid]);
    await expect(agent.analyze('actor', 'application', 1, segments)).resolves.toEqual(valid);
    const schema = generate.mock.calls[0][0].request.outputSchema;
    expect(schema.properties.facts.items.properties.quote).toMatchObject({ minLength: 5, maxLength: 500 });
    expect(schema.properties.facts.maxItems).toBe(40);
    expect(schema.properties.confidence).toMatchObject({ minimum: 0, maximum: 1 });
    expect(generate).toHaveBeenCalledTimes(2);
  });
});
