import { BadRequestException } from '@nestjs/common';
import { JsonValue, KnowledgeDraft } from './knowledge.contracts';
import { normalizeKnowledgeDraft } from './knowledge.policy';

function invalid(message: string): never { throw new BadRequestException({ code: 'KNOWLEDGE_NOT_PUBLISHABLE', message }); }
function text(value: JsonValue | undefined, label: string, min: number, max: number) {
  if (typeof value !== 'string' || value.trim().length < min || value.length > max) invalid(`${label}: cần từ ${min} đến ${max} ký tự.`);
}
function list(value: JsonValue | undefined, label: string, min: number, max: number, minLength: number, maxLength: number) {
  if (!Array.isArray(value) || value.length < min || value.length > max) invalid(`${label}: cần từ ${min} đến ${max} mục.`);
  value.forEach(item => text(item, label, minLength, maxLength));
  const normalized = (value as string[]).map(item => item.trim().toLocaleLowerCase('vi'));
  if (new Set(normalized).size !== normalized.length) invalid(`${label}: các mục phải khác nhau.`);
}
function keys(body: KnowledgeDraft['body'], allowed: string[]) {
  if (Object.keys(body).some(key => !allowed.includes(key))) invalid('Nội dung có trường ngoài cấu trúc được xuất bản.');
}
function rubric(value: JsonValue | undefined) {
  if (!Array.isArray(value) || !value.length || value.length > 12) invalid('Rubric cần 1–12 tiêu chí.');
  let total = 0; const names: string[] = [];
  for (const row of value) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) invalid('Tiêu chí chấm không hợp lệ.');
    keys(row, ['criterion', 'description', 'weight']);
    text(row.criterion, 'Tên tiêu chí', 2, 120); text(row.description, 'Mô tả tiêu chí', 10, 1000);
    if (typeof row.weight !== 'number' || !Number.isInteger(row.weight) || row.weight < 1 || row.weight > 100) invalid('Trọng số rubric phải là số nguyên dương.');
    total += row.weight; names.push((row.criterion as string).trim().toLocaleLowerCase('vi'));
  }
  if (total !== 100 || new Set(names).size !== names.length) invalid('Rubric cần tiêu chí riêng biệt và tổng trọng số bằng 100.');
}

/** Structural gate only; publication still records the human reviewer, not a model quality claim. */
export function validateKnowledgePublication(input: KnowledgeDraft): void {
  const draft = normalizeKnowledgeDraft(input), body = draft.body;
  text(draft.title, 'Tiêu đề', 5, 200); text(draft.summary, 'Mô tả', 20, 1000);
  if (!draft.sources.length) invalid('Cần ít nhất một nguồn trước khi xuất bản.');
  if (draft.kind === 'qa') {
    keys(body, ['question', 'expectedConcepts', 'validAnswers', 'exampleAnswer', 'commonMistakes', 'followUps', 'weakAnswerExamples', 'rubric']);
    text(body.question, 'Câu hỏi', 10, 4000);
    list(body.expectedConcepts, 'Ý chính', 1, 20, 1, 200);
    list(body.validAnswers, 'Các cách trả lời đúng', 2, 8, 10, 4000);
    text(body.exampleAnswer, 'Câu trả lời minh họa', 10, 4000);
    list(body.commonMistakes, 'Lỗi thường gặp', 1, 20, 3, 500);
    list(body.followUps, 'Câu hỏi đào sâu', 1, 8, 5, 1000);
    list(body.weakAnswerExamples, 'Ví dụ chưa đạt', 1, 8, 5, 2000);
    rubric(body.rubric);
  } else if (draft.kind === 'rubric') {
    keys(body, ['guidance', 'rubric']); text(body.guidance, 'Hướng dẫn chấm', 20, 4000); rubric(body.rubric);
  } else {
    keys(body, ['markdown']); text(body.markdown, 'Nội dung', 40, 40000);
  }
}
