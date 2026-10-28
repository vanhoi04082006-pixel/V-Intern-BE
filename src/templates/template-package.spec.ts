import { validateTemplateContent, publicTemplateDefinition } from './template-package';
import { LEGACY_LEARNING_LIBRARY } from './learning-library';
import { smallProjectFixture as smallFixture, privateAssessmentFixture as assessmentFixture } from '../../test/fixtures/small-project.fixture';
describe('small project package security and consistency', () => {
  it('accepts a small package with a separate assessment and keeps legacy templates valid', () => {
    expect(() => validateTemplateContent(smallFixture(), assessmentFixture())).not.toThrow();
    for (const definition of LEGACY_LEARNING_LIBRARY) expect(() => validateTemplateContent(definition)).not.toThrow();
  });
  it('keeps the public definition free of write-only assessment data', () => {
    const publicPart = publicTemplateDefinition({ ...smallFixture(), assessment: assessmentFixture() });
    expect(JSON.stringify(publicPart)).not.toMatch(/PRIVATE_|solutionFiles|hiddenTestFiles|taskSuites/); expect(publicPart.learningPackage?.starterFiles).toHaveLength(1);
  });
  it.each(['../secret', '/tmp/secret', 'C:/secret', 'src/../secret', 'src\\secret', 'src//secret', '.git/config', 'src/CON.js', 'a/NUL', 'app.js:secret', 'src/file.'])('rejects unsafe file path %s', path => {
    const definition = smallFixture(); definition.learningPackage.starterFiles[0].path = path;
    expect(() => validateTemplateContent(definition)).toThrow(expect.objectContaining({ response: expect.objectContaining({ code: 'INVALID_TEMPLATE_PACKAGE' }) }));
  });
  it('rejects case collisions and prefix collisions that cannot safely be materialized', () => {
    for (const files of [[{ path: 'App.js', content: 'a' }, { path: 'app.js', content: 'b' }], [{ path: 'src', content: 'a' }, { path: 'src/app.js', content: 'b' }],
      [{ path: 'src', content: 'a' }, { path: 'src-app.js', content: 'b' }, { path: 'src/app.js', content: 'c' }]]) {
      const definition = smallFixture(); definition.learningPackage.starterFiles = files; expect(() => validateTemplateContent(definition)).toThrow();
    }
  });
  it('bounds UTF-8 bytes, strict fields and the size of a small project', () => {
    const excessive = smallFixture(); excessive.learningPackage.starterFiles = Array.from({ length: 20 }, (_, i) => ({ path: `src/${i}.js`, content: 'ỗ'.repeat(10000) }));
    expect(() => validateTemplateContent(excessive)).toThrow();
    expect(() => validateTemplateContent({ ...smallFixture(), learningPackage: { ...smallFixture().learningPackage, actorId: 'forged' } })).toThrow();
    const long = smallFixture(); long.estimatedDurationDays = 14; long.sprints[0].durationDays = 14; expect(() => validateTemplateContent(long)).toThrow();
    const few = smallFixture(); few.sprints[0].tasks.pop(); expect(() => validateTemplateContent(few)).toThrow();
  });
  it('requires an existing task, a real digest, unique suite mappings and rubric total 100', () => {
    for (const patch of [{ taskSuites: [{ ...assessmentFixture().taskSuites[0], taskKey: 'absent' }] },
      { taskSuites: [{ ...assessmentFixture().taskSuites[0], taskKey: ' create ' }] },
      { taskSuites: [{ ...assessmentFixture().taskSuites[0], digest: 'not-a-hash' }] }, { taskSuites: Array(2).fill(assessmentFixture().taskSuites[0]) },
      { rubric: [{ ...assessmentFixture().rubric[0], weight: 90 }] }]) expect(() => validateTemplateContent(smallFixture(), { ...assessmentFixture(), ...patch })).toThrow();
  });
});
