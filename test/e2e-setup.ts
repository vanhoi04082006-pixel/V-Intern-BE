/**
 * E2E setup — runs BEFORE any module import (decorator capture safe).
 * Loosens rate limits so a full auth flow never trips the throttler.
 */
process.env.THROTTLE_LIMIT_PER_MIN = '10000';
// Phase 4 interview/AI rate limits (spec 56) — raised for the full flow.
process.env.THROTTLE_INTERVIEW_START_PER_MIN = '10000';
process.env.THROTTLE_INTERVIEW_SUBMIT_PER_MIN = '10000';
process.env.THROTTLE_EVALUATION_PER_MIN = '10000';
process.env.THROTTLE_AUTH_PER_MIN = '10000';
process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
