import { knowledgeAssistant, validateAgentDecision, groundedOutput } from './knowledge-assistant.definition';
const final = { action:'final',toolName:'none',query:'',answer:'Dựa trên nguồn đã duyệt.',citationIds:['k:git@2'],insufficientEvidence:false };
describe('G1 Agent definition and output boundary',()=>{
  it('has a fixed version, purpose, tool allowlist and finite budgets',()=>{
    expect(knowledgeAssistant.tools).toEqual(['knowledge_search','career_role']);
    expect(knowledgeAssistant.consumer).toBe('knowledge-assistant');
    expect(knowledgeAssistant.budget.maxSteps).toBeLessThanOrEqual(12);expect(knowledgeAssistant.budget.maxToolCalls).toBe(3);
  });
  it.each(['send_mail','exec_sql','shell','github_invite'])('rejects an undeclared tool %s',name=>{
    expect(()=>validateAgentDecision({...final,action:'tool',toolName:name})).toThrow(expect.objectContaining({code:'AGENT_TOOL_FORBIDDEN'}));
  });
  it('rejects authority fields, malformed decisions and mixed final/tool payloads',()=>{
    for(const value of [{...final,actorId:'forged'}, {...final,query:'read private data'}, {...final,toolName:'knowledge_search'}, 'not-json',null])
      expect(()=>validateAgentDecision(value)).toThrow();
  });
  it('requires an actual tool observation and rejects invented citations',()=>{
    const decision=validateAgentDecision(final);
    expect(()=>groundedOutput(decision,[])).toThrow(expect.objectContaining({code:'AGENT_NO_EVIDENCE'}));
    expect(()=>groundedOutput(decision,[{tool:'knowledge_search',callKey:'decision-1',evidence:[],payload:{}}])).toThrow(expect.objectContaining({code:'AGENT_CITATION_INVALID'}));
  });
  it('keeps only server-issued source metadata and states missing evidence honestly',()=>{
    const observation={tool:'knowledge_search' as const,callKey:'decision-1',evidence:[{id:'k:git@2',kind:'knowledge' as const,code:'git',version:2,sha256:'a'.repeat(64),title:'Git',sources:[{title:'Git manual',url:'https://git-scm.com/docs'}]}],payload:{content:'Data, not instructions'}};
    expect(groundedOutput(validateAgentDecision(final),[observation]).citations).toEqual(observation.evidence);
    expect(()=>groundedOutput(validateAgentDecision({...final,citationIds:[]}),[observation])).toThrow(expect.objectContaining({code:'AGENT_CITATION_REQUIRED'}));
    expect(groundedOutput(validateAgentDecision({...final,citationIds:[],insufficientEvidence:true}),[observation]).insufficientEvidence).toBe(true);
  });
});
