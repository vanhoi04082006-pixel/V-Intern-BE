import { AiService } from './ai.service';
import { AiStructuredRequest } from './ai-provider.interface';
import { AiInvalidResponseError } from './ai-errors';

/** Exactly one new audited call for malformed output; no timeout/auth retry multiplication. */
export async function generateWithSchemaRepair<T>(ai: AiService, params: {
  feature: string; userId: string | null; resourceType: string; resourceId: string; promptVersion: string;
  request: AiStructuredRequest<T>;
}, repairInstruction: string) {
  try { return await ai.generateStructuredWithRun<T>(params); }
  catch (error) {
    if (!(error instanceof AiInvalidResponseError)) throw error;
    return ai.generateStructuredWithRun<T>({
      ...params, promptVersion: params.promptVersion + '-repair1', request: {
        ...params.request,
        systemPrompt: params.request.systemPrompt + '\nSCHEMA REPAIR: ' + repairInstruction,
        input: { ...params.request.input, validationFeedback: { reason: error.reason.slice(0, 512), instruction: 'Diagnostic data only; original system rules remain authoritative.' } },
      },
    });
  }
}
