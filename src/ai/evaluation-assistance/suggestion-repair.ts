import { AiService } from '../ai.service';
import { AiStructuredRequest } from '../ai-provider.interface';
import { generateWithSchemaRepair } from '../schema-repair';
import { EvaluationSuggestionData } from './evaluation-suggestion-schema';

/** One separately audited repair; the cycle validator and source facts remain authoritative. */
export function generateSuggestionWithRepair(ai: AiService, params: {
  feature: string; userId: string | null; resourceType: string; resourceId: string; promptVersion: string;
  request: AiStructuredRequest<EvaluationSuggestionData>;
}) {
  return generateWithSchemaRepair(ai, params, 'Return a fresh complete advisory suggestion using the exact supplied criterion codes and maxScore values. Keep evidence to at most 6 strings of 300 characters per criterion, comments to 1000 characters, strengths and improvementAreas to 8 strings of 300 characters, summary to 2000 characters and confidence between 0 and 1. Use Vietnamese feedback. Do not invent evidence or alter official scores. The same strict validator must pass.');
}
