import { runInNewContext } from 'node:vm';
import { MINI_PROJECT_DOMAINS } from './mini-project-domains';
import { MINI_PROJECT_SOLUTIONS } from './mini-project-solutions';
import { MINI_PROJECT_CHECKS, MINI_PROJECT_FAULTS, miniAssessment } from './mini-project-assessments';
import { MINI_PROJECT_LIBRARY } from './mini-project-catalog';
import { validateTemplateContent } from './template-package';

function evaluate(source: string, check: { operation: string; args: unknown[]; expected?: unknown; error?: boolean }) {
  const module = { exports: {} as Record<string, (...args: unknown[]) => unknown> };
  runInNewContext(source, { module }, { timeout: 1000 });
  const args = structuredClone(check.args), before = JSON.stringify(args);
  try {
    const value = module.exports[check.operation](...args);
    return !check.error && JSON.stringify(value) === JSON.stringify(check.expected) && JSON.stringify(args) === before;
  } catch { return check.error === true && JSON.stringify(args) === before; }
}
describe('six reviewed teaching references and independent behavioral checks', () => {
  it.each(MINI_PROJECT_DOMAINS.map(domain => [domain.slug] as const))('%s passes every private check while both known faulty implementations fail the intended behavior', slug => {
    const checks = MINI_PROJECT_CHECKS[slug];
    expect(checks.length).toBeGreaterThanOrEqual(8);
    expect(checks.length).toBeLessThanOrEqual(50);
    expect(checks.every(check => evaluate(MINI_PROJECT_SOLUTIONS[slug], check))).toBe(true);
    expect(MINI_PROJECT_FAULTS[slug]).toHaveLength(2);
    for (const variant of MINI_PROJECT_FAULTS[slug]) {
      const check = checks.find(check => check.name === variant.killedBy)!;
      expect(check).toBeDefined(); expect(evaluate(variant.source, check)).toBe(false);
    }
    const template = MINI_PROJECT_LIBRARY.find(template => template.slug === `mini-${slug}`)!;
    const assessment = miniAssessment(slug);
    expect(() => validateTemplateContent(template, assessment)).not.toThrow();
    expect(assessment.solutionFiles[0].path).toBe('src/model.cjs');
    expect(assessment.taskSuites[0]).toMatchObject({ taskKey: 'implement-core', suiteId: `mini-${slug}-v1` });
    expect(JSON.stringify(template.learningPackage)).not.toContain(MINI_PROJECT_SOLUTIONS[slug]);
  });
});
