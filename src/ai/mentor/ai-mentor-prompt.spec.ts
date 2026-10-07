import { AiInvalidResponseError } from '../ai-errors';
import {
  AI_MENTOR_PROMPT_VERSION,
  MENTOR_MAX_RESPONSE_CHARS,
  buildMentorSystemPrompt,
  validateMentorAnswer,
} from './ai-mentor-prompt';

/**
 * AI Mentor prompt contract unit tests (Phase 6, spec 16/17/11/54):
 * bounded structured answers, no extra authority, and a system prompt that
 * carries the non-negotiable safety rules.
 */
describe('AI mentor prompt contract', () => {
  it('uses the explicit ai-mentor-v1 prompt version (spec 16/51)', () => {
    expect(AI_MENTOR_PROMPT_VERSION).toBe('ai-mentor-v1');
  });

  it('system prompt forbids inventing facts and instructs unavailability language (spec 9/17)', () => {
    const prompt = buildMentorSystemPrompt();
    expect(prompt).toContain('Never claim a fact exists that is not present');
    expect(prompt).toContain('unavailable');
    expect(prompt).not.toContain('API_KEY');
  });

  it('system prompt treats the user message as untrusted and forbids prompt revelation (spec 17/18)', () => {
    const prompt = buildMentorSystemPrompt();
    expect(prompt).toContain('untrusted');
    expect(prompt.toLowerCase()).toContain('never reveal');
    expect(prompt).toContain('cannot execute anything');
  });

  it('accepts a valid bounded answer', () => {
    const data = validateMentorAnswer(
      { answer: 'Focus on the two overdue tasks first.', summary: 'Prioritize overdue work.', followUps: ['What is my KPI?'] },
      8000,
    );
    expect(data.answer).toBe('Focus on the two overdue tasks first.');
    expect(data.followUps).toHaveLength(1);
  });

  it('rejects non-object payloads and missing fields', () => {
    expect(() => validateMentorAnswer('hello', 8000)).toThrow(AiInvalidResponseError);
    expect(() => validateMentorAnswer({ summary: 'x', followUps: [] }, 8000)).toThrow(AiInvalidResponseError);
    expect(() => validateMentorAnswer({ answer: 'x', followUps: [] }, 8000)).toThrow(AiInvalidResponseError);
  });

  it('rejects empty and oversized answers (spec 11)', () => {
    expect(() => validateMentorAnswer({ answer: '   ', summary: 's', followUps: [] }, 8000)).toThrow(
      AiInvalidResponseError,
    );
    const big = 'a'.repeat(MENTOR_MAX_RESPONSE_CHARS + 1);
    expect(() => validateMentorAnswer({ answer: big, summary: 's', followUps: [] }, 8000)).toThrow(
      /exceeds 8000/,
    );
  });

  it('rejects oversized followUps and non-string items (spec 11)', () => {
    const tooMany = Array.from({ length: 6 }, (_, i) => `q${i}`);
    expect(() =>
      validateMentorAnswer({ answer: 'a', summary: 's', followUps: tooMany }, 8000),
    ).toThrow(/exceeds 5 items/);
    expect(() =>
      validateMentorAnswer({ answer: 'a', summary: 's', followUps: [42] }, 8000),
    ).toThrow(AiInvalidResponseError);
  });

  it('a narrower service bound further constrains the answer', () => {
    expect(() =>
      validateMentorAnswer({ answer: 'a'.repeat(201), summary: 's', followUps: [] }, 200),
    ).toThrow(AiInvalidResponseError);
  });
});
