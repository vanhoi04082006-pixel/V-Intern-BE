import {
  AiFetchLike,
  AiProvider,
  AiStructuredRequest,
  AiStructuredResult,
} from '../ai-provider.interface';
import { AiInvalidResponseError, AiProviderError, AiProviderTimeoutError } from '../ai-errors';

/**
 * REAL AI provider adapter (Phase 4, spec 23/26/27/28) — Google Gemini.
 *
 * Selected because the preserved V-Intern prototype established no real
 * provider (its recruitment flow was mock-only), so Phase 4 implements a
 * standard, widely-documented provider configured purely through env:
 *
 *   AI_PROVIDER=gemini
 *   AI_API_KEY=...   (server-only, NEVER returned by any API or log)
 *   AI_MODEL=gemini-2.0-flash   (or any supported model id)
 *
 * Design points:
 * - responseMimeType:'application/json' asks Gemini for pure JSON output.
 * - Each attempt is bounded by AbortController (spec 27 — no hanging).
 * - HTTP 429/5xx and network failures are retryable; 401/403/400 are not.
 * - The raw provider error body is NEVER surfaced — only status classes.
 * - `fetchImpl` is injectable: unit tests mock the HTTP layer fully
 *   (spec 61 — no real provider is ever contacted by tests).
 */

const DEFAULT_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

export interface GeminiProviderOptions {
  apiKey: string;
  model: string;
  timeoutMs: number;
  fetchImpl?: AiFetchLike;
  endpoint?: string;
}

interface GeminiEnvelope {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  error?: { message?: string };
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && (err.name === 'AbortError' || /abort/i.test(err.message));
}

/** Node 18+/22 global fetch already matches the AiFetchLike shape. */
const defaultFetch: AiFetchLike = async (url, init) => {
  const res = await fetch(url, init);
  return { status: res.status, ok: res.ok, text: () => res.text() };
};

export class GeminiProvider implements AiProvider {
  readonly name = 'gemini';
  readonly model: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: AiFetchLike;
  private readonly endpoint: string;

  constructor(options: GeminiProviderOptions) {
    if (!options.apiKey) {
      throw new Error('GeminiProvider requires an API key (AI_API_KEY).');
    }
    if (!options.model) {
      throw new Error('GeminiProvider requires a model id (AI_MODEL).');
    }
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.timeoutMs = options.timeoutMs;
    this.fetchImpl = options.fetchImpl ?? defaultFetch;
    this.endpoint = options.endpoint ?? DEFAULT_ENDPOINT;
  }

  async generateStructured<T>(request: AiStructuredRequest<T>): Promise<AiStructuredResult<T>> {
    const startedAt = Date.now();

    // AbortController bounds EVERY attempt (spec 27). The signal is passed
    // through the injected transport so mocked tests exercise the same path.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: { status: number; ok: boolean; text: () => Promise<string> };
    let body: string;
    try {
      response = await this.fetchImpl(
        `${this.endpoint}/${encodeURIComponent(this.model)}:generateContent`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.apiKey },
          body: JSON.stringify({
            // System rubric/instructions live in systemInstruction (spec 31) —
            // strictly separated from the untrusted candidate content below.
            systemInstruction: { parts: [{ text: request.systemPrompt }] },
            contents: [{ role: 'user', parts: [{ text: JSON.stringify(request.input) }] }],
            generationConfig: {
              responseMimeType: 'application/json',
              temperature: request.modelOptions?.temperature ?? 0.2,
              maxOutputTokens: request.modelOptions?.maxOutputTokens ?? 4096,
            },
          }),
          signal: controller.signal,
        },
      );
      // fetch resolves at headers. Keep the deadline active until the body is
      // consumed too; a stalled successful response must not hang generation.
      body = response.ok ? await response.text() : '';
    } catch (err) {
      if (isAbortError(err)) throw new AiProviderTimeoutError(this.timeoutMs);
      // Network-layer failure (DNS, socket, TLS) — transient by definition.
      throw new AiProviderError('network', 'AI provider network failure.', { retryable: true });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const status = response.status;
      if (status === 401 || status === 403) {
        // Invalid credentials — NEVER retried (spec 28), body never leaked.
        throw new AiProviderError('auth', `AI provider rejected credentials (HTTP ${status}).`, {
          status,
          retryable: false,
        });
      }
      if (status === 429) {
        throw new AiProviderError('rate_limited', 'AI provider rate limit hit (HTTP 429).', {
          status,
          retryable: true,
        });
      }
      if (status >= 500) {
        throw new AiProviderError('server', `AI provider server error (HTTP ${status}).`, {
          status,
          retryable: true,
        });
      }
      throw new AiProviderError('request', `AI provider rejected the request (HTTP ${status}).`, {
        status,
        retryable: false,
      });
    }

    let envelope: GeminiEnvelope;
    try {
      envelope = JSON.parse(body) as GeminiEnvelope;
    } catch {
      throw new AiProviderError('server', 'AI provider returned a non-JSON envelope.', {
        retryable: false,
      });
    }

    const text = envelope.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    if (!text.trim()) {
      throw new AiInvalidResponseError('empty completion');
    }

    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      throw new AiInvalidResponseError('completion is not valid JSON');
    }

    // Domain validator (request.validate) decides usability — the adapter
    // itself knows nothing about recruitment scoring semantics.
    const data = request.validate(raw);

    return {
      data,
      provider: this.name,
      model: this.model,
      latencyMs: Date.now() - startedAt,
      inputTokens: envelope.usageMetadata?.promptTokenCount ?? null,
      outputTokens: envelope.usageMetadata?.candidatesTokenCount ?? null,
    };
  }
}
