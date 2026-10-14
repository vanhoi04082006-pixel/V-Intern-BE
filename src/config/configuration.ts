/**
 * Central app configuration — read ONCE from process env.
 * main.ts validates secrets before Nest boots (fail-fast, honest errors).
 */
export interface AppConfig {
  port: number;
  env: string;
  isProduction: boolean;
  db: {
    host: string;
    port: number;
    name: string;
    username: string;
    password: string;
    encrypt: boolean;
    trustServerCertificate: boolean;
  };
  jwt: { secret: string; expiresIn: string };
  refresh: { ttlDays: number; cookieName: string; cookiePath: string };
  corsOrigins: string[];
  throttle: {
    limitPerMin: number;
    authPerMin: number;
    /** Phase 4 (spec 56): stricter AI-cost protection on interview routes. */
    interviewStartPerMin: number;
    interviewSubmitPerMin: number;
    interviewChatPerMin: number;
    evaluationPerMin: number;
    /** Phase 6 (spec 56): AI mentor messages — strict per-minute bound. */
    aiMentorPerMin: number;
    /** Phase 6 (spec 56): evaluation assistance generations — low rate. */
    aiEvaluationAssistPerMin: number;
    /** Phase 6 (spec 35/56): recommendation refresh — low rate. */
    aiRecommendationPerMin: number;
  };
  /**
   * Phase 4 AI core (spec 26). AI is OPTIONAL infrastructure: when
   * AI_PROVIDER is unset every AI call fails honestly with
   * AI_PROVIDER_UNAVAILABLE — there is NEVER a fake-score fallback (spec 25).
   */
  ai: {
    provider: string; // '' = unconfigured
    apiKey: string; // server-only, never returned by any API (spec 26)
    model: string;
    timeoutMs: number;
    maxRetries: number;
    /** Phase 6 (spec 57/58): mentor history window — last N messages sent. */
    mentorHistoryWindow: number;
    /** Phase 6 (spec 11): user message bound (1..N chars). */
    mentorMaxMessageChars: number;
    /** Phase 6 (spec 57): assistant response bound (chars). */
    mentorMaxResponseChars: number;
  };
  /** Phase 5 certificates (spec 51/52): verification URL base — configurable, never a hardcoded host. */
  certificates: { verifyBaseUrl: string };
  /** Phase 4 recruitment policy (spec 14/18/19 — documented defaults). */
  recruitment: {
    interviewDurationMinutes: number; // default 30 (approved copy: "30 phút")
    maxAttempts: number; // default 3
    retakeCooldownHours: number; // default 24 after a failed evaluation
  };
}

export function appConfig(env: NodeJS.ProcessEnv): AppConfig {
  const jwtSecret = env.JWT_SECRET ?? '';
  if (jwtSecret.length < 32) {
    throw new Error(
      'CONFIG ERROR: JWT_SECRET is missing or shorter than 32 characters. ' +
        'Refusing to boot (never run with a weak/default secret).',
    );
  }
  const dbPassword = env.DB_PASSWORD ?? '';
  if (dbPassword.length === 0) {
    throw new Error('CONFIG ERROR: DB_PASSWORD is empty. Refusing to boot.');
  }
  return {
    port: Number(env.PORT ?? 8080),
    env: env.NODE_ENV ?? 'development',
    isProduction: (env.NODE_ENV ?? 'development') === 'production',
    db: {
      host: env.DB_HOST ?? 'localhost',
      port: Number(env.DB_PORT ?? 1433),
      name: env.DB_NAME ?? 'VIntern',
      username: env.DB_USERNAME ?? 'vintern_app',
      password: dbPassword,
      encrypt: (env.DB_ENCRYPT ?? 'false') !== 'false',
      trustServerCertificate: (env.DB_TRUST_SERVER_CERTIFICATE ?? 'true') !== 'false',
    },
    jwt: { secret: jwtSecret, expiresIn: env.JWT_EXPIRES_IN ?? '15m' },
    refresh: {
      ttlDays: Number(env.REFRESH_TOKEN_TTL_DAYS ?? 7),
      cookieName: 'vintern_refresh',
      cookiePath: '/api/v1/auth',
    },
    corsOrigins: (env.CORS_ORIGINS ?? 'http://localhost:3001,http://localhost:3000')
      .split(',')
      .map((o) => o.trim())
      .filter((o) => o.length > 0),
    throttle: {
      limitPerMin: Number(env.THROTTLE_LIMIT_PER_MIN ?? 100),
      authPerMin: Number(env.THROTTLE_AUTH_PER_MIN ?? 10),
      interviewStartPerMin: Number(env.THROTTLE_INTERVIEW_START_PER_MIN ?? 5),
      interviewSubmitPerMin: Number(env.THROTTLE_INTERVIEW_SUBMIT_PER_MIN ?? 6),
      interviewChatPerMin: Number(env.THROTTLE_INTERVIEW_CHAT_PER_MIN ?? 15),
      evaluationPerMin: Number(env.THROTTLE_EVALUATION_PER_MIN ?? 3),
      aiMentorPerMin: Number(env.THROTTLE_AI_MENTOR_PER_MIN ?? 10),
      aiEvaluationAssistPerMin: Number(env.THROTTLE_AI_EVALUATION_ASSIST_PER_MIN ?? 4),
      aiRecommendationPerMin: Number(env.THROTTLE_AI_RECOMMENDATION_PER_MIN ?? 4),
    },
    ai: {
      provider: (env.AI_PROVIDER ?? '').trim().toLowerCase(),
      apiKey: env.AI_API_KEY ?? '',
      model: env.AI_MODEL ?? '',
      timeoutMs: Number(env.AI_TIMEOUT_MS ?? 60_000),
      maxRetries: Number(env.AI_MAX_RETRIES ?? 2),
      mentorHistoryWindow: Number(env.AI_MENTOR_HISTORY_WINDOW ?? 10),
      mentorMaxMessageChars: Number(env.AI_MENTOR_MAX_MESSAGE_CHARS ?? 8000),
      mentorMaxResponseChars: Number(env.AI_MENTOR_MAX_RESPONSE_CHARS ?? 8000),
    },
    certificates: {
      verifyBaseUrl: env.CERTIFICATE_VERIFY_BASE_URL ?? 'http://localhost:8080/api/v1/certificates/verify',
    },
    recruitment: {
      interviewDurationMinutes: Number(env.RECRUITMENT_INTERVIEW_DURATION_MINUTES ?? 30),
      maxAttempts: Number(env.RECRUITMENT_MAX_ATTEMPTS ?? 3),
      retakeCooldownHours: Number(env.RECRUITMENT_RETAKE_COOLDOWN_HOURS ?? 24),
    },
  };
}
