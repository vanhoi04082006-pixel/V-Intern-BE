/**
 * AI error taxonomy (Phase 4, spec 26/27/39/74) — stable API error codes.
 * Raw provider error bodies are NEVER leaked through these errors; only
 * safe, classified metadata travels to the HTTP layer.
 */

/** No provider configured (AI_PROVIDER unset) — honest unavailability. */
export class AiProviderUnavailableError extends Error {
  readonly code = 'AI_PROVIDER_UNAVAILABLE';
  constructor(message = 'AI provider is not configured.') {
    super(message);
    this.name = 'AiProviderUnavailableError';
  }
}

/** Attempt exceeded its bounded timeout (spec 27) — never hangs a route. */
export class AiProviderTimeoutError extends Error {
  readonly code = 'AI_PROVIDER_TIMEOUT';
  readonly timeoutMs: number;
  constructor(timeoutMs: number) {
    super(`AI provider did not respond within ${timeoutMs}ms.`);
    this.name = 'AiProviderTimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

/** Provider responded but the payload was not usable structured output. */
export class AiInvalidResponseError extends Error {
  readonly code = 'AI_INVALID_RESPONSE';
  readonly reason: string;
  constructor(reason: string) {
    super(`AI response failed validation: ${reason}`);
    this.name = 'AiInvalidResponseError';
    this.reason = reason;
  }
}

/** Transport/HTTP failure. `retryable` gates the bounded retry helper. */
export class AiProviderError extends Error {
  readonly status: number | null;
  readonly retryable: boolean;
  /** Stable short classification (never the raw provider body). */
  readonly kind: 'network' | 'rate_limited' | 'server' | 'auth' | 'request';
  constructor(
    kind: AiProviderError['kind'],
    message: string,
    options: { status?: number | null; retryable?: boolean } = {},
  ) {
    super(message);
    this.name = 'AiProviderError';
    this.kind = kind;
    this.status = options.status ?? null;
    this.retryable = options.retryable ?? false;
  }
}

/** True for the transient failures the retry helper is allowed to retry. */
export function isRetryableAiError(err: unknown): boolean {
  return err instanceof AiProviderError && err.retryable;
}

/** Stable API error code for any AI failure (spec 74). */
export function aiErrorCode(err: unknown): string {
  if (err instanceof AiProviderUnavailableError) return err.code;
  if (err instanceof AiProviderTimeoutError) return err.code;
  if (err instanceof AiInvalidResponseError) return err.code;
  if (err instanceof AiProviderError) {
    if (err.kind === 'rate_limited') return 'AI_PROVIDER_RATE_LIMITED';
    if (err.kind === 'auth') return 'AI_PROVIDER_UNAVAILABLE';
    return 'AI_PROVIDER_UNAVAILABLE';
  }
  return 'AI_EVALUATION_FAILED';
}
