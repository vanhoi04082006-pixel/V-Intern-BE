import { isDeepStrictEqual } from 'node:util';
import type { DataSource } from 'typeorm';
import { MINI_PROJECT_LIBRARY } from './mini-project-catalog';
import { miniAssessment } from './mini-project-assessments';
import { validateTemplateContent } from './template-package';
import { appendTemplateRevision } from './template-revisions.store';

/** Explicit operator upgrade. Existing/custom/archived material and pinned v1 runs remain untouched. */
export async function ensureMiniProjectAssessments(db: DataSource, actor: string) {
  const result = { upgraded: 0, preserved: 0 };
  for (const template of MINI_PROJECT_LIBRARY) {
    const slug = template.slug!.slice(5), assessment = miniAssessment(slug); validateTemplateContent(template, assessment);
    const action = await db.transaction(async em => {
      const [row]: Array<{ id: string; version: number; status: string; definitionJson: string }> = await em.query('SELECT id,version,status,definitionJson FROM project_templates WITH(UPDLOCK,HOLDLOCK) WHERE code=@0', [template.code]);
      if (!row || row.version !== 1 || row.status !== 'active' || !isDeepStrictEqual(JSON.parse(row.definitionJson), template)) return 'preserved' as const;
      const existing = await em.query('SELECT version FROM project_template_assessments WHERE templateId=@0', [row.id]);
      if (existing.length) return 'preserved' as const;
      await em.query('UPDATE project_templates SET version=2 WHERE id=@0', [row.id]);
      await appendTemplateRevision(em, row.id, 2, row.definitionJson, actor, assessment);
      return 'upgraded' as const;
    });
    result[action]++;
  }
  return result;
}
