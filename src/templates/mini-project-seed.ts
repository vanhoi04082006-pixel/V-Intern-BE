import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { MINI_PROJECT_LIBRARY } from './mini-project-catalog';
import { validateBlueprint } from './blueprint-validation';
import { publicTemplateDefinition, validateTemplateContent } from './template-package';
import { appendTemplateRevision } from './template-revisions.store';

/** Opt-in teaching catalog. An existing code belongs to its editor, even at v1. */
export async function ensureMiniProjectLibrary(db: DataSource, actor: string) {
  const result = { inserted: 0, preserved: 0 };
  for (const template of MINI_PROJECT_LIBRARY) {
    validateBlueprint(template); validateTemplateContent(template);
    const action = await db.transaction(async em => {
      const rows: Array<{ id: string }> = await em.query('SELECT id FROM project_templates WITH(UPDLOCK,HOLDLOCK) WHERE code=@0', [template.code]);
      if (rows.length) return 'preserved' as const;
      const id = randomUUID(), definition = JSON.stringify(publicTemplateDefinition(template));
      await em.query('INSERT INTO project_templates(id,code,name,category,difficulty,definitionJson,createdById) VALUES(@0,@1,@2,@3,@4,@5,@6)', [id, template.code, template.name, template.category, template.difficulty, definition, actor]);
      await appendTemplateRevision(em, id, 1, definition, actor);
      return 'inserted' as const;
    });
    result[action]++;
  }
  return result;
}
