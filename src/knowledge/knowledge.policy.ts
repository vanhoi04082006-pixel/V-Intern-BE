import { BadRequestException } from '@nestjs/common';
import { createHash } from 'crypto';
import { KNOWLEDGE_AUDIENCES, KNOWLEDGE_KINDS, KNOWLEDGE_PURPOSES, KnowledgeDraft, KnowledgeSnapshot, KnowledgeSource, KnowledgeStatus } from './knowledge.contracts';

function invalid(message: string): never { throw new BadRequestException({ code: 'KNOWLEDGE_INVALID_DRAFT', message }); }
function text(value: unknown, min: number, max: number): string {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) invalid('Nội dung văn bản của tri thức không hợp lệ.');
  return value.trim();
}
function strings(value: unknown, max: number, length: number): string[] {
  if (!Array.isArray(value) || value.length > max) invalid('Danh sách metadata vượt giới hạn.');
  const result = value.map(v => text(v, 1, length));
  if (new Set(result.map(v => v.toLocaleLowerCase('vi'))).size !== result.length) invalid('Metadata không được trùng nhau.');
  return result;
}
function source(value: KnowledgeSource): KnowledgeSource {
  if (!value || typeof value !== 'object') invalid('Nguồn tài liệu không hợp lệ.');
  const result: KnowledgeSource = { title: text(value.title, 2, 200) };
  if (value.url !== undefined) {
    result.url = text(value.url, 8, 2000);
    try {
      const url = new URL(result.url);
      if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) invalid('Nguồn phải dùng URL HTTPS không chứa thông tin đăng nhập.');
    } catch { invalid('Nguồn phải dùng URL HTTPS không chứa thông tin đăng nhập.'); }
  }
  if (value.reference !== undefined) result.reference = text(value.reference, 3, 1000);
  if (!result.url && !result.reference) invalid('Nguồn cần URL hoặc tham chiếu tài liệu.');
  return result;
}

/** Canonical JSON also rejects values silently discarded by JSON.stringify. */
function canonical(value: unknown, depth = 0, budget = { nodes: 0 }): string {
  if (depth > 12 || ++budget.nodes > 5000) invalid('Nội dung quá sâu hoặc quá phức tạp.');
  if (value === null || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'string') { if (value.length > 80000) invalid('Nội dung vượt 80.000 ký tự.'); return JSON.stringify(value); }
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + Array.from(value, item => canonical(item, depth + 1, budget)).join(',') + ']';
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return '{' + Object.keys(value).sort().map(key => {
      if (['__proto__', 'constructor', 'prototype'].includes(key)) invalid('Nội dung chứa khóa không được phép.');
      return JSON.stringify(key) + ':' + canonical((value as Record<string, unknown>)[key], depth + 1, budget);
    }).join(',') + '}';
  }
  return invalid('Nội dung phải là JSON thuần, không chứa giá trị không xác định.');
}

export function normalizeKnowledgeDraft(input: KnowledgeDraft): KnowledgeDraft {
  if (!input || !KNOWLEDGE_KINDS.includes(input.kind) || !KNOWLEDGE_AUDIENCES.includes(input.audience)
    || !['vi', 'en'].includes(input.language) || (input.difficulty !== null && !['easy', 'medium', 'hard'].includes(input.difficulty))) invalid('Loại, quyền, ngôn ngữ hoặc độ khó không hợp lệ.');
  if (['qa', 'solution', 'rubric'].includes(input.kind) && input.audience !== 'grading_only') invalid('Câu trả lời, lời giải và rubric phải thuộc phạm vi chấm bài.');
  const purposes = strings(input.purposes, 9, 32);
  if (!purposes.length || purposes.some(value => !KNOWLEDGE_PURPOSES.includes(value as KnowledgeDraft['purposes'][number]))) invalid('Cần chọn mục đích sử dụng hợp lệ.');
  const roleCodes = strings(input.roleCodes, 30, 32);
  if (roleCodes.some(value => !/^[a-z][a-z0-9_]{1,31}$/.test(value))) invalid('Mã nghề nghiệp không hợp lệ.');
  if (!Array.isArray(input.sources) || input.sources.length > 20) invalid('Tối đa 20 nguồn tài liệu.');
  if (!input.body || typeof input.body !== 'object' || Array.isArray(input.body)) invalid('Nội dung phải là một object JSON.');
  const result: KnowledgeDraft = {
    kind: input.kind, title: text(input.title, 2, 200), summary: text(input.summary, 0, 1000), language: input.language,
    difficulty: input.difficulty, audience: input.audience, purposes: purposes as KnowledgeDraft['purposes'], roleCodes,
    tags: strings(input.tags, 30, 80), sources: input.sources.map(source), body: input.body,
  };
  const json = canonical(result);
  if (json.length > 80000) invalid('Nội dung vượt 80.000 ký tự.');
  return JSON.parse(json) as KnowledgeDraft;
}

export function serializeKnowledgeSnapshot(code: string, version: number, status: KnowledgeStatus, draft: KnowledgeDraft) {
  const snapshot: KnowledgeSnapshot = { ...draft, schemaVersion: 1, code, version, status };
  const snapshotJson = canonical(snapshot);
  return { snapshotJson, sha256: createHash('sha256').update(snapshotJson, 'utf8').digest('hex') };
}
