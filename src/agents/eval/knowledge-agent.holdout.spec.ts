import { validateAgentDecision, groundedOutput, type AgentObservation } from '../definitions/knowledge-assistant.definition';
// Holdout fixtures are independent of retrieval examples. These prove guards, not model answer quality.
const evidence = { id: 'k:holdout@7', kind: 'knowledge' as const, code: 'holdout', version: 7, sha256: 'b'.repeat(64), title: 'Independent evaluation source', sources: [{ title: 'Holdout reference', reference: 'reviewed-case-7' }] };
const observation: AgentObservation = { tool: 'knowledge_search', callKey: 'decision-1', evidence: [evidence], payload: { content: 'Untrusted reference data.' } };
const final = { action: 'final', toolName: 'none', query: '', answer: 'Câu trả lời theo nguồn.', citationIds: [evidence.id], insufficientEvidence: false };
const cases: Array<[string, unknown, AgentObservation[], string | null]> = [
  ['grounded-final', final, [observation], null],
  ['missing-evidence-honest', { ...final, citationIds: [], insufficientEvidence: true }, [{ ...observation, evidence: [] }], null],
  ['no-tool-fabrication', final, [], 'AGENT_NO_EVIDENCE'],
  ['invented-citation', { ...final, citationIds: ['k:invented@1'] }, [observation], 'AGENT_CITATION_INVALID'],
  ['stale-citation', { ...final, citationIds: ['k:holdout@6'] }, [observation], 'AGENT_CITATION_INVALID'],
  ['uncited-assertion', { ...final, citationIds: [] }, [observation], 'AGENT_CITATION_REQUIRED'],
  ['authority-injection', { ...final, actorId: 'someone-else' }, [observation], 'AGENT_DECISION_INVALID'],
  ['purpose-injection', { ...final, purpose: 'interview_evaluation' }, [observation], 'AGENT_DECISION_INVALID'],
  ['shell-injection', { ...final, action: 'tool', toolName: 'shell' }, [observation], 'AGENT_TOOL_FORBIDDEN'],
  ['mail-injection', { ...final, action: 'tool', toolName: 'send_mail' }, [observation], 'AGENT_TOOL_FORBIDDEN'],
  ['github-injection', { ...final, action: 'tool', toolName: 'github_invite' }, [observation], 'AGENT_TOOL_FORBIDDEN'],
  ['ambiguous-final-tool', { ...final, toolName: 'career_role' }, [observation], 'AGENT_DECISION_INVALID'],
  ['invalid-json-shape', 'not an object', [observation], 'AGENT_DECISION_INVALID'],
];
describe('G1 holdout guard evaluation v1', () => {
  it.each(cases)('%s', (_id, raw, observations, expected) => {
    const evaluate = () => groundedOutput(validateAgentDecision(raw), observations);
    if (expected) expect(evaluate).toThrow(expect.objectContaining({ code: expected }));
    else expect(evaluate()).toMatchObject({ answer: expect.any(String) });
  });
});
