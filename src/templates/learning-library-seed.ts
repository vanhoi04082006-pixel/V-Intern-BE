import { randomUUID } from 'crypto';
import { isDeepStrictEqual } from 'node:util';
import { DataSource } from 'typeorm';
import { LEARNING_LIBRARY, LEGACY_LEARNING_LIBRARY } from './learning-library';
import { publicTemplateDefinition, validateTemplateContent } from './template-package';
import { appendTemplateRevision } from './template-revisions.store';

/** Upgrade only untouched bundled V1 definitions; never rewrite edited templates or run snapshots. */
export async function ensureLearningLibrary(db: DataSource, actor: string) {
  const result = { inserted: 0, upgraded: 0, preserved: 0 };
  for (const template of LEARNING_LIBRARY) {
    validateTemplateContent(template, template.assessment);
    const definitionJson = JSON.stringify(publicTemplateDefinition(template));
    const action = await db.transaction(async em => {
      const rows: Array<{ id: string; version: number; definitionJson: string; status: string }> = await em.query('SELECT id,version,definitionJson,status FROM project_templates WITH(UPDLOCK,HOLDLOCK) WHERE code=@0', [template.code]);
      const row = rows[0];
      if (!row) {
        const id = randomUUID();
        await em.query('INSERT INTO project_templates(id,code,name,category,difficulty,definitionJson,createdById) VALUES(@0,@1,@2,@3,@4,@5,@6)', [id, template.code, template.name, template.category, template.difficulty, definitionJson, actor]);
        await appendTemplateRevision(em, id, 1, definitionJson, actor, template.assessment);
        return 'inserted' as const;
      }
      const legacy = LEGACY_LEARNING_LIBRARY.find(value => value.code === template.code);
      if (row.version === 1 && row.status === 'active' && legacy && isDeepStrictEqual(JSON.parse(row.definitionJson), legacy)) {
        await appendTemplateRevision(em, row.id, row.version, row.definitionJson, actor);
        await em.query('UPDATE project_templates SET definitionJson=@1,version=version+1 WHERE id=@0', [row.id, definitionJson]);
        await appendTemplateRevision(em, row.id, row.version + 1, definitionJson, actor, template.assessment);
        return 'upgraded' as const;
      }
      return 'preserved' as const;
    });
    result[action]++;
  }
  return result;
}
