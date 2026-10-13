/** Runs before each suite's imports, when Throttle decorators capture their limits. */
const path = expect.getState().testPath?.replace(/\\/g, '/') ?? '';
if (path.endsWith('/start-session.e2e-spec.ts') || path.endsWith('/ai-generation.e2e-spec.ts')) {
  // These suites exercise many replays/validation requests, not rate limiting.
  process.env.THROTTLE_AI_GENERATION_PER_MIN = '100';
} else if (path.endsWith('/security-hotfix.e2e-spec.ts')) {
  // P0 must always exercise the production default, even if the caller overrides it.
  delete process.env.THROTTLE_AI_GENERATION_PER_MIN;
}
