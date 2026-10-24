import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { MINI_PROJECT_LIBRARY } from './mini-project-catalog';

/** Executes only this repository's authored starters, never HTTP/imported content. */
describe('authored mini-project starter smoke', () => {
  it.each(MINI_PROJECT_LIBRARY.map(template => [template.code!, template] as const))('%s starts, parses and reports unfinished acceptance honestly', (_code, template) => {
    const root = resolve(process.cwd(), '.runtime', 'mini-project-starter-tests');
    mkdirSync(root, { recursive: true });
    const folder = mkdtempSync(join(root, 'starter-'));
    const run = (args: string[]) => spawnSync(process.execPath, args, { cwd: folder, encoding: 'utf8', timeout: 10000, windowsHide: true });
    try {
      const files = [...template.learningPackage!.starterFiles, ...template.learningPackage!.sampleData!];
      for (const file of files) {
        const target = resolve(folder, file.path);
        if (!target.startsWith(folder + sep)) throw Error('Starter file escaped its owned folder.');
        mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, file.content, 'utf8');
        if (file.path.endsWith('.cjs')) {
          const syntax = run(['--check', target]); expect({ error: syntax.error, stderr: syntax.stderr, status: syntax.status }).toEqual({ error: undefined, stderr: '', status: 0 });
        }
      }
      const demo = run(['demo.cjs']); expect(demo.status).toBe(0); expect(demo.stdout).toContain(template.name); expect(demo.stdout).toContain('chưa phải kết quả nghiệm thu');
      const unfinished = run(['demo.cjs', '--run']); expect(unfinished.status).toBe(2); expect(unfinished.stderr).toContain('TODO:');
      const acceptance = run(['--test', 'test/acceptance.test.cjs']);
      expect(acceptance.status).toBe(1); expect(acceptance.stdout).toContain('TODO:'); expect(acceptance.stdout).not.toMatch(/SyntaxError|MODULE_NOT_FOUND/);
    } finally {
      const target = resolve(folder);
      if (!target.startsWith(root + sep) || target === root) throw Error('Refusing unsafe starter cleanup.');
      rmSync(target, { recursive: true });
    }
  }, 30000);
});
