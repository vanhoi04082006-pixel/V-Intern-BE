import { MINI_PROJECT_LIBRARY } from '../templates/mini-project-catalog';
import { MINI_PROJECT_SOLUTIONS } from '../templates/mini-project-solutions';
import { MINI_PROJECT_CHECKS, MINI_PROJECT_FAULTS } from '../templates/mini-project-assessments';

// Trusted teaching code only. Output must be written inside the operator's project runtime directory.
process.stdout.write(JSON.stringify(MINI_PROJECT_LIBRARY.map(template => {
  const slug = template.slug!.slice(5);
  return { slug, code: template.code, files: [...template.learningPackage!.starterFiles, ...template.learningPackage!.sampleData!],
    checks: MINI_PROJECT_CHECKS[slug].map(check => ({ ...check, kind: 'module' })),
    variants: [{ name: 'reference', source: MINI_PROJECT_SOLUTIONS[slug], expected: 'pass' }, ...MINI_PROJECT_FAULTS[slug].map(fault => ({ ...fault, expected: 'fail' }))] };
}), null, 2) + '\n');
