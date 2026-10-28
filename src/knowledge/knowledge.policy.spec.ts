import { BadRequestException } from '@nestjs/common';
import { KnowledgeDraft } from './knowledge.contracts';
import { normalizeKnowledgeDraft, serializeKnowledgeSnapshot } from './knowledge.policy';

const draft = (): KnowledgeDraft => ({
  kind: 'guide', title: '  Đọc lỗi Git  ', summary: 'Tra cứu thông báo lỗi trước khi sửa.', language: 'vi', difficulty: 'easy',
  audience: 'student_safe', purposes: ['mentoring'], roleCodes: ['frontend'], tags: [' Git '],
  sources: [{ title: 'Git documentation', url: 'https://git-scm.com/docs' }], body: { markdown: 'Hãy đọc thông báo và kiểm tra working tree.' },
});

describe('knowledge draft boundary and immutable snapshot', () => {
  it('normalizes metadata, preserves body whitespace and does not mutate the input', () => {
    const input = draft(); input.body = { markdown: '  source example\n' };
    const result = normalizeKnowledgeDraft(input);
    expect(result).toMatchObject({ title: 'Đọc lỗi Git', tags: ['Git'], body: { markdown: '  source example\n' } });
    expect(input.title).toBe('  Đọc lỗi Git  ');
    expect(normalizeKnowledgeDraft({ ...draft(), sources: [] }).sources).toEqual([]);
  });

  it.each(['qa', 'solution', 'rubric'] as const)('never classifies %s as safe for student support', kind => {
    expect(() => normalizeKnowledgeDraft({ ...draft(), kind })).toThrow(BadRequestException);
    expect(normalizeKnowledgeDraft({ ...draft(), kind, audience: 'grading_only' }).audience).toBe('grading_only');
  });

  it.each([
    { purposes: ['unregistered'] }, { purposes: [] }, { purposes: ['mentoring', 'mentoring'] },
    { roleCodes: ['Frontend'] }, { roleCodes: ['frontend', 'frontend'] }, { tags: ['Git', 'git'] },
    { audience: 'public' }, { kind: 'cv' }, { language: 'fr' }, { difficulty: 'extreme' },
    { title: ' ' }, { sources: [{ title: 'Source' }] },
    { sources: [{ title: 'Source', url: 'file:///C:/private' }] },
    { sources: [{ title: 'Source', url: 'https://user:secret@example.com' }] },
    { body: [] }, { body: { invalid: undefined } }, { body: { invalid: NaN } },
    { body: JSON.parse('{"__proto__":{"admin":true}}') }, { body: { markdown: 'x'.repeat(80001) } },
  ])('rejects invalid or dangerous draft input %#', override => {
    expect(() => normalizeKnowledgeDraft({ ...draft(), ...override } as KnowledgeDraft)).toThrow(BadRequestException);
  });

  it('rejects cycles and excessive nesting instead of overflowing the process', () => {
    const circular: Record<string, unknown> = {}; circular.self = circular;
    expect(() => normalizeKnowledgeDraft({ ...draft(), body: circular } as KnowledgeDraft)).toThrow(BadRequestException);
    let nested: Record<string, unknown> = {}; for (let i = 0; i < 14; i++) nested = { child: nested };
    expect(() => normalizeKnowledgeDraft({ ...draft(), body: nested } as KnowledgeDraft)).toThrow(BadRequestException);
  });

  it('creates reproducible versioned snapshots regardless of object key insertion order', () => {
    const a = serializeKnowledgeSnapshot('git-guide', 1, 'draft', normalizeKnowledgeDraft({ ...draft(), body: { b: 2, a: 1 } }));
    const b = serializeKnowledgeSnapshot('git-guide', 1, 'draft', normalizeKnowledgeDraft({ ...draft(), body: { a: 1, b: 2 } }));
    expect(a).toEqual(b); expect(a.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.parse(a.snapshotJson)).toMatchObject({ schemaVersion: 1, code: 'git-guide', version: 1, status: 'draft', title: 'Đọc lỗi Git' });
    expect(serializeKnowledgeSnapshot('git-guide', 2, 'draft', normalizeKnowledgeDraft(draft())).sha256).not.toBe(a.sha256);
  });
});
