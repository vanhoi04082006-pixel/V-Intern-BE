import { BadRequestException } from '@nestjs/common';
import type { KnowledgeAudience, KnowledgeKind, KnowledgePurpose, KnowledgeSnapshot } from './knowledge.contracts';

export const RETRIEVAL_POLICY_VERSION = 'knowledge-retrieval-v1';
export const KNOWLEDGE_CONSUMERS = ['mentor', 'interviewer', 'advisor', 'planner', 'reviewer', 'interview-evaluator', 'evaluation-assistant', 'cv-analyst', 'coordinator', 'knowledge-assistant'] as const;
export type KnowledgeConsumer = typeof KNOWLEDGE_CONSUMERS[number];
export interface RetrievalPolicy {
  purpose: KnowledgePurpose; audiences: KnowledgeAudience[]; kinds: KnowledgeKind[];
  permission: string; resource: 'self' | 'project' | 'interview' | 'catalog';
}
const studentKinds: KnowledgeKind[] = ['guide', 'exercise'];
const staffKinds: KnowledgeKind[] = ['guide', 'exercise', 'plan_template', 'communication'];
const gradingKinds: KnowledgeKind[] = ['qa', 'guide', 'exercise', 'solution', 'rubric'];
const policies: Record<KnowledgeConsumer, RetrievalPolicy> = {
  mentor: { purpose: 'mentoring', audiences: ['student_safe'], kinds: studentKinds, permission: 'ai.mentor.use', resource: 'self' },
  interviewer: { purpose: 'interview', audiences: ['student_safe'], kinds: studentKinds, permission: 'recruitment.start.own', resource: 'interview' },
  advisor: { purpose: 'recommendation', audiences: ['student_safe'], kinds: studentKinds, permission: 'ai.recommendations.view.own', resource: 'self' },
  planner: { purpose: 'planning', audiences: ['student_safe', 'staff_only'], kinds: staffKinds, permission: 'sprints.manage', resource: 'project' },
  reviewer: { purpose: 'code_review', audiences: ['student_safe', 'staff_only', 'grading_only'], kinds: gradingKinds, permission: 'tasks.manage', resource: 'project' },
  'interview-evaluator': { purpose: 'interview_evaluation', audiences: ['student_safe', 'staff_only', 'grading_only'], kinds: gradingKinds, permission: 'knowledge.read', resource: 'interview' },
  'evaluation-assistant': { purpose: 'evaluation_assistance', audiences: ['student_safe', 'staff_only', 'grading_only'], kinds: gradingKinds, permission: 'ai.evaluation.assist', resource: 'project' },
  'cv-analyst': { purpose: 'cv_screening', audiences: ['student_safe', 'staff_only'], kinds: staffKinds, permission: 'knowledge.read', resource: 'catalog' },
  coordinator: { purpose: 'communication', audiences: ['student_safe', 'staff_only'], kinds: staffKinds, permission: 'knowledge.read', resource: 'catalog' },
  'knowledge-assistant': { purpose: 'mentoring', audiences: ['student_safe'], kinds: studentKinds, permission: 'knowledge.read', resource: 'catalog' },
};
export function retrievalPolicy(consumer: KnowledgeConsumer): RetrievalPolicy {
  if (!Object.hasOwn(policies, consumer)) throw new BadRequestException('Agent đọc tri thức không được hỗ trợ.');
  return structuredClone(policies[consumer]);
}
export function retrievalQuery(value: string) {
  if (typeof value !== 'string' || !value.trim() || value.length > 1000) throw new BadRequestException('Truy vấn tri thức cần 1–1000 ký tự.');
  const terms = [...new Set(value.toLocaleLowerCase('vi').match(/[\p{L}\p{N}_-]+/gu) ?? [])].filter(term => term.length <= 64).slice(0, 16);
  if (!terms.length) throw new BadRequestException('Cần ít nhất một từ khóa tri thức.');
  return { terms };
}
export interface RetrievalCandidate { id: string; code: string; version: number; sha256: string; score: number; snapshot: KnowledgeSnapshot }
/** Defence in depth after SQL filtering. Ranking never grants access. */
export function allowedKnowledge(row: RetrievalCandidate, policy: RetrievalPolicy, roles: string[]) {
  const s = row.snapshot;
  return s.schemaVersion === 1 && s.status === 'published' && s.code === row.code && s.version === row.version
    && policy.audiences.includes(s.audience) && policy.kinds.includes(s.kind) && s.purposes.includes(policy.purpose)
    && (!s.roleCodes.length || s.roleCodes.some(code => roles.includes(code)));
}
export interface KnowledgeCitation {
  id: string; code: string; version: number; sha256: string; title: string; kind: KnowledgeKind;
  sources: KnowledgeSnapshot['sources']; content: string; truncated: boolean; trust: 'reference_data';
}
/** Context is bounded as serialized data; citations remain complete when body excerpts shrink. */
export function packKnowledge(rows: RetrievalCandidate[], policy: RetrievalPolicy, roles: string[], budget = 24000) {
  if (!Number.isInteger(budget) || budget < 2048 || budget > 24000) throw new BadRequestException('Ngân sách context tri thức không hợp lệ.');
  const items: KnowledgeCitation[] = [];
  for (const row of rows) {
    if (items.length === 5) break;
    if (!allowedKnowledge(row, policy, roles)) continue;
    const snapshot = row.snapshot;
    const content = typeof snapshot.body.markdown === 'string' ? snapshot.body.markdown : JSON.stringify(snapshot.body);
    const citation: KnowledgeCitation = { id: row.id.toLowerCase(), code: row.code, version: row.version, sha256: row.sha256, title: snapshot.title, kind: snapshot.kind,
      sources: structuredClone(snapshot.sources.slice(0, 3)), content: '', truncated: true, trust: 'reference_data' };
    if (JSON.stringify([...items, citation]).length + 40 > budget) continue;
    const characters = Array.from(content), max = Math.min(characters.length, 8000);
    let low = 0, high = max;
    while (low < high) {
      const length = Math.ceil((low + high) / 2);
      const next = { ...citation, content: characters.slice(0, length).join(''), truncated: length < characters.length };
      if (JSON.stringify([...items, next]).length <= budget) low = length; else high = length - 1;
    }
    if (low < 40 && characters.length >= 40) continue;
    citation.content = characters.slice(0, low).join(''); citation.truncated = low < characters.length; items.push(citation);
  }
  return { policyVersion: RETRIEVAL_POLICY_VERSION, items, contextCharacters: JSON.stringify(items).length };
}
