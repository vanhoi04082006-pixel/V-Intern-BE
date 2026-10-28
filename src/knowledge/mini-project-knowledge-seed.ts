import type { DataSource } from "typeorm";
import type { KnowledgeStore } from "./knowledge.store";
import { MINI_PROJECT_KNOWLEDGE } from "./mini-project-knowledge";

/** Explicitly reviewed bundled content only. Existing author-owned codes are never overwritten. */
export async function ensureMiniProjectKnowledge(
  db: DataSource,
  store: KnowledgeStore,
  actor: string,
) {
  const result = { published: 0, preserved: 0 };
  for (const entry of MINI_PROJECT_KNOWLEDGE) {
    const existing = await db.query(
      "SELECT id FROM knowledge_entries WHERE code=@0",
      [entry.code],
    );
    if (existing.length) {
      result.preserved++;
      continue;
    }
    const draft = await store.saveDraft(actor, entry.code, null, entry.draft);
    await store.publish(actor, entry.code, draft.version);
    result.published++;
  }
  return result;
}
