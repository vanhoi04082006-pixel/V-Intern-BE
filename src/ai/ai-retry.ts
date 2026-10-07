import { AiProviderTimeoutError, isRetryableAiError } from './ai-errors';

/**
 * Bounded retry helper (Phase 4, spec 28).
 *
 * Retries ONLY transient failures (network / 429 / 5xx). Never retries:
 * - invalid credentials / bad requests (AiProviderError retryable=false)
 * - invalid structured output (AiInvalidResponseError)
 * - timeouts (each attempt is already bounded; re-running a full timeout
 *   would multiply worst-case latency — documented decision)
 *
 * Backoff: exponential (base * 2^n) capped, with the delay function
 * injectable so unit tests run without real sleeping.
 */
export interface RetryOptions {
  /** Additional attempts after the first (0 = single attempt). */
  maxRetries: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export async function withBoundedRetries<T>(
  fn: (attempt: number) => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  const maxRetries = Math.max(0, Math.floor(options.maxRetries));
  const base = options.baseDelayMs ?? 500;
  const cap = options.maxDelayMs ?? 8000;
  const sleep = options.sleep ?? defaultSleep;

  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastError = err;
      const isLast = attempt === maxRetries;
      if (isLast || !isRetryableAiError(err)) throw err;
      const delay = Math.min(cap, base * 2 ** attempt);
      await sleep(delay);
    }
  }
  /* istanbul ignore next — loop always returns or throws */
  throw lastError;
}

/**
 * Race a promise against a hard deadline. The timer ALWAYS clears so
 * Node is never kept alive by a dangling handle. Rejection of the worked
 * promise is preserved when it settles first.
 */
export async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new AiProviderTimeoutError(timeoutMs)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
