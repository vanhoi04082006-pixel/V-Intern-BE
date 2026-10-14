/**
 * Phase 4 recruitment constants — single source for defaults that the
 * config, services, tests and documentation all reference (spec 14/18/19).
 */
/** Approved per-session composition (preserved from the raw product). */
export const INTERVIEW_QUESTION_TOTAL = 10;
export const INTERVIEW_TECHNICAL_COUNT = 6;
export const INTERVIEW_SOFT_COUNT = 4;

/** Documented defaults (spec 18/19) — env-overridable via configuration. */
export const RECRUITMENT_INTERVIEW_DURATION_MINUTES_DEFAULT = 30;
export const RECRUITMENT_MAX_ATTEMPTS_DEFAULT = 3;
export const RECRUITMENT_RETAKE_COOLDOWN_HOURS_DEFAULT = 24;

/** Answer length bounds (spec 43 — DTO + service double-check). */
export const INTERVIEW_ANSWER_MIN_LENGTH = 1;
export const INTERVIEW_ANSWER_MAX_LENGTH = 5000;
