import { LEGACY_LEARNING_LIBRARY } from '../../src/templates/learning-library';
export const smallProjectFixture = () => ({ ...structuredClone(LEGACY_LEARNING_LIBRARY[0]), code: 'SMALL-P01', name: 'Sổ ghi chú nhỏ', estimatedDurationDays: 4,
  milestones: [], sprints: [{ name: 'Làm và kiểm chứng', goal: 'Ghi chú có kiểm thử', durationDays: 4, tasks: ['create', 'search', 'verify'].map((key, index) => ({
    key, title: key, requirements: 'Thực hiện tiêu chí và kiểm chứng kết quả.', dod: ['Có bằng chứng kiểm thử'], role: 'frontend', storyPoints: 2, dependsOn: index ? ['create'] : [],
  })) }], roles: ['frontend'], roleDetails: [{ code: 'frontend', countMin: 1, countMax: 1 }], recommendedTeamSize: 1,
  learningPackage: { schemaVersion: 1 as const, prerequisites: ['JavaScript cơ bản'], setup: 'Dùng Node 22, không cần dependency ngoài.', run: 'Chạy node --test để kiểm tra và node app.js để demo.',
    starterFiles: [{ path: 'app.js', content: 'export const notes = [];' }], sampleData: [{ path: 'data/notes.json', content: '[]' }] } });
export const privateAssessmentFixture = () => ({ schemaVersion: 1 as const, solutionFiles: [{ path: 'app.js', content: 'PRIVATE_SOLUTION' }], hiddenTestFiles: [{ path: 'tests/hidden.test.js', content: 'PRIVATE_TEST' }],
  rubric: [{ criterion: 'Đúng tiêu chí', description: 'Đạt nghiệp vụ và kiểm thử theo đề.', weight: 100 }], taskSuites: [{ taskKey: 'create', suiteId: 'notes-create-v1', digest: 'a'.repeat(64) }] });
