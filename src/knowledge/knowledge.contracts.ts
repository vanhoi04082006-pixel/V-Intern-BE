export const KNOWLEDGE_KINDS = ['qa', 'guide', 'exercise', 'solution', 'rubric', 'plan_template', 'communication'] as const;
export const KNOWLEDGE_AUDIENCES = ['student_safe', 'staff_only', 'grading_only'] as const;
export const KNOWLEDGE_PURPOSES = ['interview', 'interview_evaluation', 'planning', 'code_review', 'mentoring', 'evaluation_assistance', 'recommendation', 'cv_screening', 'communication'] as const;
export const KNOWLEDGE_STATUSES = ['draft', 'published', 'archived'] as const;
export type KnowledgeKind = typeof KNOWLEDGE_KINDS[number];
export type KnowledgeAudience = typeof KNOWLEDGE_AUDIENCES[number];
export type KnowledgePurpose = typeof KNOWLEDGE_PURPOSES[number];
export type KnowledgeStatus = typeof KNOWLEDGE_STATUSES[number];
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export interface KnowledgeSource { title: string; url?: string; reference?: string }
/** Draft bodies are bounded JSON. Publication validates the kind-specific schema in K02. */
export interface KnowledgeDraft {
  kind: KnowledgeKind;
  title: string;
  summary: string;
  language: 'vi' | 'en';
  difficulty: 'easy' | 'medium' | 'hard' | null;
  audience: KnowledgeAudience;
  purposes: KnowledgePurpose[];
  roleCodes: string[];
  tags: string[];
  sources: KnowledgeSource[];
  body: { [key: string]: JsonValue };
}
export interface KnowledgeSnapshot extends KnowledgeDraft { schemaVersion: 1; code: string; version: number; status: KnowledgeStatus }
export interface KnowledgeListQuery {
  page: number; pageSize: number; search?: string; status?: KnowledgeStatus; kind?: KnowledgeKind;
  audience?: KnowledgeAudience; purpose?: KnowledgePurpose; roleCode?: string;
}
