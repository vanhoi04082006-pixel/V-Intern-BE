import { MigrationInterface, QueryRunner } from 'typeorm';

/** Adopt template/project career references without opening recruitment. */
export class AdoptTemplateCareerRoles1762723200000 implements MigrationInterface {
  name = 'AdoptTemplateCareerRoles1762723200000';
  async up(q: QueryRunner): Promise<void> {
    const codes: Array<{ code: string }> = await q.query(`
      SELECT roleCode code FROM project_role_slots
      UNION SELECT N'devops'
      UNION SELECT roles.[value] FROM project_templates t
        CROSS APPLY OPENJSON(t.definitionJson,'$.roles') roles WHERE roles.[type]=1
      UNION SELECT JSON_VALUE(CASE WHEN details.[type]=5 THEN details.[value] ELSE N'{}' END,'$.code') FROM project_templates t
        CROSS APPLY OPENJSON(t.definitionJson,'$.roleDetails') details
        WHERE JSON_VALUE(CASE WHEN details.[type]=5 THEN details.[value] ELSE N'{}' END,'$.code') IS NOT NULL
      UNION SELECT JSON_VALUE(CASE WHEN tasks.[type]=5 THEN tasks.[value] ELSE N'{}' END,'$.role') FROM project_templates t
        CROSS APPLY OPENJSON(t.definitionJson,'$.sprints') sprints
        CROSS APPLY OPENJSON(CASE WHEN sprints.[type]=5 THEN sprints.[value] ELSE N'{}' END,'$.tasks') tasks
        WHERE JSON_VALUE(CASE WHEN tasks.[type]=5 THEN tasks.[value] ELSE N'{}' END,'$.role') IS NOT NULL
    `);
    if (codes.some(row => row.code.length > 32)) throw new Error('A legacy template/project career code exceeds 32 characters. Preserve its references and define an explicit mapping before migration; automatic truncation is forbidden.');
    for (const { code } of codes) {
      const existing: unknown[] = await q.query('SELECT code FROM career_roles WHERE code=@0', [code]);
      if (existing.length) continue;
      const name = code === 'devops' ? 'DevOps Engineer' : code;
      await q.query("INSERT INTO career_roles(code,name,status,acceptingApplications) VALUES(@0,@1,'archived',0)", [code, name]);
      const snapshot = { code, name, description: '', level: 'intern', language: 'vi', requiredSkills: [], optionalSkills: [], competencyWeights: {}, status: 'archived', acceptingApplications: false, version: 1 };
      await q.query('INSERT INTO career_role_revisions(roleCode,version,snapshotJson) VALUES(@0,1,@1)', [code, JSON.stringify(snapshot)]);
    }
  }
  async down(): Promise<void> {
    // Deliberately retain adopted data on downgrade: deleting it loses history.
    // Reapplying never overwrites administrator edits or duplicates revisions.
  }
}
