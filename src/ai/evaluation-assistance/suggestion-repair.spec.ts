import { AiService } from '../ai.service';
import { AiInvalidResponseError, AiProviderTimeoutError } from '../ai-errors';
import { generateSuggestionWithRepair } from './suggestion-repair';
import { validateEvaluationSuggestion } from './evaluation-suggestion-schema';

describe('bounded evaluation suggestion repair', () => {
  const validate = (raw: unknown) => validateEvaluationSuggestion(raw, [{ code: 'quality', maxScore: 100 }]);
  const params = { feature: 'evaluation-assistance', userId: 'qa-student', resourceType: 'evaluation', resourceId: 'qa-evaluation', promptVersion: 'evaluation-assistance-v2', request: { task: 'evaluation-assistance', systemPrompt: 'Suggestions are advisory; never apply scores.', input: { evaluationContext: { criteria: [{ code: 'quality', maxScore: 100 }], completedTaskCount: 3 } }, schemaName: 'EvaluationSuggestion', validate } };
  it('uses the first valid response without an extra model call', async () => {
    const result = { data: { summary: 'Advisory evidence only' }, run: { id: 'initial' } };
    const generateStructuredWithRun = jest.fn().mockResolvedValue(result);
    expect(await generateSuggestionWithRepair({ generateStructuredWithRun } as unknown as AiService, params)).toBe(result);
    expect(generateStructuredWithRun).toHaveBeenCalledTimes(1);
  });
  it('retries malformed output once with the same facts and strict cycle validator', async () => {
    const generateStructuredWithRun = jest.fn().mockRejectedValueOnce(new AiInvalidResponseError('summary exceeds 2000 characters')).mockResolvedValueOnce({ data: {}, run: { id: 'repair' } });
    await generateSuggestionWithRepair({ generateStructuredWithRun } as unknown as AiService, params);
    expect(generateStructuredWithRun).toHaveBeenCalledTimes(2);
    const retry = generateStructuredWithRun.mock.calls[1][0];
    expect(retry.promptVersion).toBe('evaluation-assistance-v2-repair1');
    expect(retry.request.validate).toBe(validate);
    expect(retry.request.input.evaluationContext).toEqual(params.request.input.evaluationContext);
    expect(retry.request.input.validationFeedback.reason).toBe('summary exceeds 2000 characters');
    expect(() => retry.request.validate({ criterionSuggestions: [{ criterionCode: 'invented', suggestedScore: 90 }] })).toThrow(AiInvalidResponseError);
  });
  it('does not multiply timeout or authentication failures', async () => {
    const generateStructuredWithRun = jest.fn().mockRejectedValue(new AiProviderTimeoutError(1000));
    await expect(generateSuggestionWithRepair({ generateStructuredWithRun } as unknown as AiService, params)).rejects.toThrow(AiProviderTimeoutError);
    expect(generateStructuredWithRun).toHaveBeenCalledTimes(1);
  });
  it('stops after a second invalid response', async () => {
    const generateStructuredWithRun = jest.fn().mockRejectedValue(new AiInvalidResponseError('still invalid'));
    await expect(generateSuggestionWithRepair({ generateStructuredWithRun } as unknown as AiService, params)).rejects.toThrow(AiInvalidResponseError);
    expect(generateStructuredWithRun).toHaveBeenCalledTimes(2);
  });
});
