import { learningAssessment } from './learning-assessment';
describe('learning assessment context', () => {
  it('preserves actual strengths, gaps and English evidence without inventing missing scores', () => {
    expect(learningAssessment({ technicalScore: '83.2', strengthsJson: '["React"]', weaknessesJson: '["TypeScript"]', criteriaJson: '[{"code":"english","score":71,"feedback":"Clear update"}]' })).toEqual({ technicalScore: 83.2, englishScore: 71, strengths: ['React'], weaknesses: ['TypeScript'], skillAssessment: [{ code: 'english', score: 71, feedback: 'Clear update' }] });
    expect(learningAssessment({ strengthsJson: 'bad', criteriaJson: 'null' })).toEqual({ technicalScore: null, englishScore: null, strengths: [], weaknesses: [], skillAssessment: [] });
  });
});
