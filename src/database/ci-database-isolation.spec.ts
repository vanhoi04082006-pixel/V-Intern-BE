import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
describe('CI fixture database isolation', () => {
  it('reserves a different SQL database for each dedicated migration or domain step', () => {
    const workflow = readFileSync(resolve(__dirname, '../../.github/workflows/backend-ci.yml'), 'utf8');
    const names = [...workflow.matchAll(/^\s+DB_NAME:\s*(VIntern_E2E_CI_.*)$/gm)].map(match => match[1].trim());
    expect(names.length).toBeGreaterThan(5);
    expect(new Set(names).size).toBe(names.length);
  });
});
