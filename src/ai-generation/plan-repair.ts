import { AiService } from '../ai/ai.service';
import { AiStructuredRequest } from '../ai/ai-provider.interface';
import { generateWithSchemaRepair } from '../ai/schema-repair';
import { SprintPlan } from './sprint-plan.schema';

/** A failed run remains auditable. One bounded new generation must pass the same validator. */
export async function generatePlanWithRepair(ai: AiService, params: {
  feature: string; userId: string | null; resourceType: string; resourceId: string; promptVersion: string;
  request: AiStructuredRequest<SprintPlan>;
}) {
  return generateWithSchemaRepair(ai, params, 'Generate a fresh complete plan from the same facts. Keep all task and milestone dates inside the session and planned sprint window. Each milestone deadline must follow all referenced task deadlines and be no later than the last sprint end. Set task dates before milestones. Avoid cyclic/unknown references. Preserve role, assignment and acceptance requirements; never invent evidence or remove validation constraints.');
}
