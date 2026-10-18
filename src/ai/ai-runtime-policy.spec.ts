import { validateAiRuntimePolicy } from './ai-runtime-policy';
describe('bounded administrator AI policy', () => {
  const valid = { model: 'gemini-model-for-test', timeoutMs: 60000, maxRetries: 2, version: 0 };
  it('accepts a model identifier and bounded execution policy', () => { expect(validateAiRuntimePolicy(valid)).toEqual(valid); });
  it.each([{ model: 'https://private-host/model' }, { timeoutMs: 0 }, { timeoutMs: 180001 }, { maxRetries: 4 }, { version: -1 }, { apiKey: 'must-not-store' }])('rejects unsafe or unsupported configuration %j', change => { expect(() => validateAiRuntimePolicy({ ...valid, ...change })).toThrow(); });
});
