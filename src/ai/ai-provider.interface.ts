/**
 * AI CORE (Phase 4, spec 21/22) — provider abstraction.
 *
 * Domain services (recruitment) NEVER know a vendor's HTTP format: they
 * call `AiService.generateStructuredWithRun(...)` which resolves the
 * configured provider, applies timeout/retry, validates the structured
 * payload through a domain-supplied validator and persists an AIRun
 * provenance row.
 *
 * IMPLEMENTED REAL PROVIDERS (spec 23): `gemini`
 * (src/ai/providers/gemini.provider.ts) — environment-configured
 * (AI_PROVIDER/AI_API_KEY/AI_MODEL). When AI_PROVIDER is unset the token
 * resolves to NULL and every call fails honestly with
 * AI_PROVIDER_UNAVAILABLE — production NEVER silently falls back to fake
 * scores (spec 25). A deterministic TestAIProvider exists ONLY inside
 * test suites and overrides this token there (spec 24/25/60).
 */

/** Nest DI token holding the resolved AiProvider (or null = unconfigured). */
export const AI_PROVIDER_TOKEN = 'AI_PROVIDER';

/** Transport signature injected into providers (mockable in unit tests). */
export type AiFetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal },
) => Promise<{ status: number; ok: boolean; text: () => Promise<string> }>;

export interface AiModelOptions {
  temperature?: number;
  maxOutputTokens?: number;
}

export interface AiStructuredRequest<T> {
  /** Stable logical task name (provenance/telemetry only). */
  task: string;
  /** Full system prompt — stays server-side, never returned by any API. */
  systemPrompt: string;
  /** Structured user input (serialized to JSON by the provider adapter). */
  input: Record<string, unknown>;
  /** Short schema name used in error messages/logs (never the prompt). */
  schemaName: string;
  /** Optional provider-enforced JSON shape; domain validation remains authoritative. */
  outputSchema?: Record<string, unknown>;
  /**
   * Domain validator: receives the RAW provider JSON and either returns a
   * strongly-typed value or throws AiInvalidResponseError. Provider-supplied
   * decision fields (e.g. `passed`) are ignored inside the validator — the
   * Backend is the ONLY authority for PASS/FAIL (spec 5/36).
   */
  validate: (raw: unknown) => T;
  modelOptions?: AiModelOptions;
}

export interface AiStructuredResult<T> {
  data: T;
  provider: string;
  model: string;
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
}

export interface AiProvider {
  readonly name: string;
  readonly model: string;
  /** Single attempt: bounded by the provider's own timeout (spec 27). */
  generateStructured<T>(request: AiStructuredRequest<T>): Promise<AiStructuredResult<T>>;
}
