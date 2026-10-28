import { MINI_PROJECT_KNOWLEDGE } from '../knowledge/mini-project-knowledge';
import { normalizeKnowledgeDraft } from '../knowledge/knowledge.policy';
import { validateKnowledgePublication } from '../knowledge/knowledge-publication.policy';

// Pure export: no environment, database, status change, remote call or file write.
for (const row of MINI_PROJECT_KNOWLEDGE) {
  normalizeKnowledgeDraft(row.draft); validateKnowledgePublication(row.draft);
}
process.stdout.write(JSON.stringify(MINI_PROJECT_KNOWLEDGE, null, 2) + '\n');
