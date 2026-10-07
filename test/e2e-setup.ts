/**
 * E2E setup — runs BEFORE any module import (decorator capture safe).
 * Loosens rate limits so a full auth flow never trips the throttler.
 */
process.env.THROTTLE_LIMIT_PER_MIN = '10000';
process.env.THROTTLE_AUTH_PER_MIN = '10000';
process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
