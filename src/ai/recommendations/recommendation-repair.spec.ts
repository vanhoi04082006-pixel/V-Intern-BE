import { AiService } from '../ai.service';
import { AiInvalidResponseError, AiProviderTimeoutError } from '../ai-errors';
import { generateRecommendationWithRepair } from './recommendation-repair';
import { validateRecommendations } from './recommendations-schema';

describe('bounded grounded recommendation repair', () => {
  const facts = { metrics: { taskCompletionRate: 100, averageEvaluationScore: 85.5 } };
  const params = { feature: 'recommendation', userId: 'qa', resourceType: 'ai_recommendation_snapshot', resourceId: 'qa', promptVersion: 'performance-recommendation-v2', request: { task: 'recommendation', systemPrompt: 'Only explain supplied metrics.', input: { sourceFacts: facts }, schemaName: 'Recommendation', validate: validateRecommendations } };
  it('does not spend a second call for a valid first response', async () => {
    const result = { data: {}, run: { id: 'valid' } }, generateStructuredWithRun = jest.fn().mockResolvedValue(result);
    expect(await generateRecommendationWithRepair({ generateStructuredWithRun } as unknown as AiService, params)).toBe(result);
    expect(generateStructuredWithRun).toHaveBeenCalledTimes(1);
  });
  it('keeps deterministic facts and the metric whitelist in one separately audited repair', async () => {
    const generateStructuredWithRun = jest.fn().mockRejectedValueOnce(new AiInvalidResponseError('unknown metric')).mockResolvedValueOnce({ data: {}, run: { id: 'repair' } });
    await generateRecommendationWithRepair({ generateStructuredWithRun } as unknown as AiService, params);
    expect(generateStructuredWithRun).toHaveBeenCalledTimes(2);
    const retry = generateStructuredWithRun.mock.calls[1][0];
    expect(retry.promptVersion).toBe('performance-recommendation-v2-repair1');
    expect(retry.request.input.sourceFacts).toEqual(facts);
    expect(retry.request.validate).toBe(validateRecommendations);
    expect(() => retry.request.validate({ recommendations: [{ type: 'skill_focus', priority: 'high', title: 'Learn', reason: 'Evidence', actions: ['Practice'], evidenceMetricCodes: ['invented'] }], summary: 'Grounded advice' })).toThrow(AiInvalidResponseError);
  });
  it('does not retry timeouts', async () => {
    const generateStructuredWithRun = jest.fn().mockRejectedValue(new AiProviderTimeoutError(1000));
    await expect(generateRecommendationWithRepair({ generateStructuredWithRun } as unknown as AiService, params)).rejects.toThrow(AiProviderTimeoutError);
    expect(generateStructuredWithRun).toHaveBeenCalledTimes(1);
  });
  it('stops after a second invalid response without accepting partial advice', async () => {
    const generateStructuredWithRun = jest.fn().mockRejectedValue(new AiInvalidResponseError('still invalid'));
    await expect(generateRecommendationWithRepair({ generateStructuredWithRun } as unknown as AiService, params)).rejects.toThrow(AiInvalidResponseError);
    expect(generateStructuredWithRun).toHaveBeenCalledTimes(2);
  });
});
