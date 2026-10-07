import { GeminiProvider } from './gemini.provider';
import {
  AiInvalidResponseError,
  AiProviderError,
  AiProviderTimeoutError,
} from '../ai-errors';
import type { AiFetchLike } from '../ai-provider.interface';

/**
 * AI adapter unit tests (Phase 4 spec 61) — the HTTP layer is FULLY
 * mocked; no real provider is ever contacted.
 */
function geminiEnvelope(text: string, tokens?: { in: number; out: number }): string {
  return JSON.stringify({
    candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }],
    ...(tokens ? { usageMetadata: { promptTokenCount: tokens.in, candidatesTokenCount: tokens.out } } : {}),
  });
}

const VALID_PAYLOAD = {
  technicalScore: 85,
  softSkillScore: 72,
  criteria: [],
  strengths: ['a'],
  weaknesses: ['b'],
  feedback: 'ok',
};

function makeProvider(overrides: Partial<{ fetchImpl: AiFetchLike; timeoutMs: number }> = {}) {
  return new GeminiProvider({
    apiKey: 'test-key',
    model: 'gemini-test',
    timeoutMs: overrides.timeoutMs ?? 1000,
    fetchImpl: overrides.fetchImpl,
  });
}

const request = {
  task: 'recruitment-evaluation',
  systemPrompt: 'SYSTEM',
  input: { role: 'frontend' },
  schemaName: 'RecruitmentEvaluation',
  validate: (raw: unknown) => {
    const o = raw as Record<string, unknown>;
    if (
      typeof o.technicalScore !== 'number' ||
      typeof o.softSkillScore !== 'number' ||
      o.technicalScore < 0 ||
      o.technicalScore > 100
    ) {
      throw new AiInvalidResponseError('scores invalid');
    }
    return o;
  },
};

describe('GeminiProvider (spec 61 — mocked transport)', () => {
  it('returns validated structured data + provenance on success', async () => {
    const fetchImpl = jest.fn(async () => ({
      status: 200,
      ok: true,
      text: async () => geminiEnvelope(JSON.stringify(VALID_PAYLOAD), { in: 12, out: 34 }),
    }));
    const provider = makeProvider({ fetchImpl });
    const result = await provider.generateStructured(request);
    expect(result.data).toEqual(VALID_PAYLOAD);
    expect(result.provider).toBe('gemini');
    expect(result.model).toBe('gemini-test');
    expect(result.inputTokens).toBe(12);
    expect(result.outputTokens).toBe(34);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    // Request shape: system prompt isolated; user content is JSON text.
    const call = fetchImpl.mock.calls[0] as unknown as [string, { body: string }];
    const init = call[1];
    const body = JSON.parse(init.body);
    expect(body.systemInstruction.parts[0].text).toBe('SYSTEM');
    expect(JSON.parse(body.contents[0].parts[0].text)).toEqual({ role: 'frontend' });
    expect(body.generationConfig.responseMimeType).toBe('application/json');
  });

  it('malformed JSON completion → AI_INVALID_RESPONSE (non-retryable)', async () => {
    const fetchImpl: AiFetchLike = async () => ({
      status: 200,
      ok: true,
      text: async () => geminiEnvelope('not-json{{'),
    });
    await expect(makeProvider({ fetchImpl }).generateStructured(request)).rejects.toBeInstanceOf(
      AiInvalidResponseError,
    );
  });

  it('schema-invalid payload (validator throws) → AI_INVALID_RESPONSE', async () => {
    const fetchImpl: AiFetchLike = async () => ({
      status: 200,
      ok: true,
      text: async () => geminiEnvelope(JSON.stringify({ technicalScore: 'high', softSkillScore: 1 })),
    });
    await expect(makeProvider({ fetchImpl }).generateStructured(request)).rejects.toBeInstanceOf(
      AiInvalidResponseError,
    );
  });

  it('score out of bounds → AI_INVALID_RESPONSE', async () => {
    const fetchImpl: AiFetchLike = async () => ({
      status: 200,
      ok: true,
      text: async () => geminiEnvelope(JSON.stringify({ technicalScore: 150, softSkillScore: 72 })),
    });
    await expect(makeProvider({ fetchImpl }).generateStructured(request)).rejects.toBeInstanceOf(
      AiInvalidResponseError,
    );
  });

  it('empty completion → AI_INVALID_RESPONSE', async () => {
    const fetchImpl: AiFetchLike = async () => ({
      status: 200,
      ok: true,
      text: async () => geminiEnvelope(''),
    });
    await expect(makeProvider({ fetchImpl }).generateStructured(request)).rejects.toBeInstanceOf(
      AiInvalidResponseError,
    );
  });

  it('timeout (abort) → AI_PROVIDER_TIMEOUT', async () => {
    const fetchImpl: AiFetchLike = (_url, init) =>
      new Promise((_, reject) => {
        init.signal.addEventListener('abort', () => {
          const err = new Error('The operation was aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    await expect(
      makeProvider({ fetchImpl, timeoutMs: 25 }).generateStructured(request),
    ).rejects.toBeInstanceOf(AiProviderTimeoutError);
  });

  it('network failure → retryable AiProviderError', async () => {
    const fetchImpl: AiFetchLike = async () => {
      throw new Error('ECONNRESET');
    };
    const err = await makeProvider({ fetchImpl }).generateStructured(request).catch((e) => e);
    expect(err).toBeInstanceOf(AiProviderError);
    expect((err as AiProviderError).retryable).toBe(true);
  });

  it('HTTP 429 → retryable rate_limited', async () => {
    const fetchImpl: AiFetchLike = async () => ({
      status: 429,
      ok: false,
      text: async () => 'rate limited',
    });
    const err = await makeProvider({ fetchImpl }).generateStructured(request).catch((e) => e);
    expect((err as AiProviderError).retryable).toBe(true);
    expect((err as AiProviderError).kind).toBe('rate_limited');
  });

  it('HTTP 500 → retryable server error', async () => {
    const fetchImpl: AiFetchLike = async () => ({
      status: 500,
      ok: false,
      text: async () => 'boom',
    });
    const err = await makeProvider({ fetchImpl }).generateStructured(request).catch((e) => e);
    expect((err as AiProviderError).retryable).toBe(true);
  });

  it('HTTP 401/403 (invalid credentials) → NOT retryable, body never leaked', async () => {
    for (const status of [401, 403]) {
      const secret = 'SUPER-SECRET-PROVIDER-BODY';
      const fetchImpl: AiFetchLike = async () => ({
        status,
        ok: false,
        text: async () => secret,
      });
      const err = await makeProvider({ fetchImpl }).generateStructured(request).catch((e) => e);
      expect(err).toBeInstanceOf(AiProviderError);
      expect((err as AiProviderError).retryable).toBe(false);
      expect(String(err.message)).not.toContain(secret);
    }
  });

  it('constructor fails fast without key/model (spec 26)', () => {
    expect(
      () => new GeminiProvider({ apiKey: '', model: 'm', timeoutMs: 1 }),
    ).toThrow();
    expect(
      () => new GeminiProvider({ apiKey: 'k', model: '', timeoutMs: 1 }),
    ).toThrow();
  });
});
