import { AiService } from '../ai/ai.service';
import { AiInvalidResponseError, AiProviderTimeoutError } from '../ai/ai-errors';
import { generatePlanWithRepair } from './plan-repair';
import { validateSprintPlan } from './sprint-plan.schema';
describe('bounded plan schema repair', () => {
  const params = { feature: 'sprint-plan', userId: 'u', resourceType: 'project', resourceId: 'p', promptVersion: 'sprint-plan-v2', request: { task: 'sprint-plan', systemPrompt: 'Plan using supplied facts only.', input: { session: { startDate: '2026-11-01', endDate: '2026-11-14' } }, schemaName: 'sprint-plan', validate: validateSprintPlan } };
  it('records one separate repair run for invalid structure without weakening validation or replacing source facts', async () => {
    const generateStructuredWithRun = jest.fn().mockRejectedValueOnce(new AiInvalidResponseError('milestone deadline')).mockResolvedValueOnce({ data: { sprints: [] }, run: { id: 'repair-run' } });
    const result = await generatePlanWithRepair({ generateStructuredWithRun } as unknown as AiService, params);
    expect(result.run.id).toBe('repair-run');
    expect(generateStructuredWithRun).toHaveBeenCalledTimes(2);
    expect(generateStructuredWithRun.mock.calls[1][0]).toMatchObject({ promptVersion: 'sprint-plan-v2-repair1', request: { input: expect.objectContaining({ session: params.request.input.session }) } });
    expect(generateStructuredWithRun.mock.calls[1][0].request.validate).toBe(validateSprintPlan);
  });
  it('does not multiply timeout requests or keep retrying malformed plans', async () => {
    const generateStructuredWithRun = jest.fn().mockRejectedValue(new AiProviderTimeoutError(1000));
    await expect(generatePlanWithRepair({ generateStructuredWithRun } as unknown as AiService, params)).rejects.toThrow(AiProviderTimeoutError);
    expect(generateStructuredWithRun).toHaveBeenCalledTimes(1);
    generateStructuredWithRun.mockClear().mockRejectedValue(new AiInvalidResponseError('still invalid'));
    await expect(generatePlanWithRepair({ generateStructuredWithRun } as unknown as AiService, params)).rejects.toThrow(AiInvalidResponseError);
    expect(generateStructuredWithRun).toHaveBeenCalledTimes(2);
  });
});
