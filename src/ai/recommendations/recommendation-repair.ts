import { AiService } from '../ai.service';
import { AiStructuredRequest } from '../ai-provider.interface';
import { generateWithSchemaRepair } from '../schema-repair';
import { RecommendationData } from './recommendations-schema';

/** Preserve grounding and audit one extra attempt only for malformed structured output. */
export function generateRecommendationWithRepair(ai: AiService, params: {
  feature: string; userId: string | null; resourceType: string; resourceId: string; promptVersion: string;
  request: AiStructuredRequest<RecommendationData>;
}) {
  return generateWithSchemaRepair(ai, params, 'Generate a fresh complete recommendation object from the unchanged supplied facts. Use only the allowed type values and metric codes, with no invented evidence. Return 1..8 recommendations; title <=200 characters, reason <=800, 1..5 action strings each <=200, at most 5 evidenceMetricCodes and summary <=1000. Write Vietnamese. Do not alter tasks, official scores, KPI or salaries; all advice remains non-authoritative.');
}
