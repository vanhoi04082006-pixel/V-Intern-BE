import { QueryRunner } from 'typeorm';
import { AdoptTemplateCareerRoles1762723200000 } from './1762723200000-AdoptTemplateCareerRoles';

it('adopts repeated references once without a SQL DISTINCT over unbounded JSON', async () => {
  const known = new Set(['frontend']);
  const query = jest.fn(async (sql: string, params?: string[]) => {
    if (sql.includes('OPENJSON')) {
      expect(sql).not.toMatch(/UNION\s+SELECT/);
      return ['frontend', 'devops', 'legacy_mobile', 'legacy_mobile'].map(code => ({ code }));
    }
    if (sql.startsWith('SELECT code')) return known.has(params![0]) ? [{ code: params![0] }] : [];
    if (sql.startsWith('INSERT INTO career_roles')) known.add(params![0]);
    return [];
  });
  await new AdoptTemplateCareerRoles1762723200000().up({ query } as unknown as QueryRunner);
  const revisions = query.mock.calls.filter(([sql]) => sql.startsWith('INSERT INTO career_role_revisions'));
  expect(revisions.map(([, params]) => params![0])).toEqual(['devops', 'legacy_mobile']);
  expect(known).toEqual(new Set(['frontend', 'devops', 'legacy_mobile']));
});

it('refuses an oversized reference before writing any career data', async () => {
  const query = jest.fn().mockResolvedValue([{ code: 'x'.repeat(33) }]);
  await expect(new AdoptTemplateCareerRoles1762723200000().up({ query } as unknown as QueryRunner)).rejects.toThrow('exceeds 32 characters');
  expect(query).toHaveBeenCalledTimes(1);
});
