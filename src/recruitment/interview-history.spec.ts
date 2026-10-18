import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { InterviewService } from './interview.service';
import { RecruitmentService } from './recruitment.service';
import { InterviewSession } from './entities/interview-session.entity';

describe('owned interview history', () => {
  it('paginates the principal sessions and returns only their sanitized results', async () => {
    const findAndCount = jest.fn().mockResolvedValue([[{
      id: 's1', roleCode: 'backend', status: 'completed', attemptNumber: 2,
      startedAt: new Date(), expiresAt: new Date(), submittedAt: new Date(),
      evaluatedAt: new Date(), questionCount: 10, userId: 'owner',
    }], 3]);
    const find = jest.fn().mockResolvedValue([{
      id: 'r1', sessionId: 's1', technicalScore: '81', softSkillScore: '75', overallScore: '79.2',
      decision: 'passed', strengthsJson: '["API design"]', weaknessesJson: '["Testing"]',
      criteriaJson: '[]', feedback: 'Good reasoning', recommendedRole: 'backend',
      model: 'model', promptVersion: 'v2', evaluatedAt: new Date(),
      aiRunId: 'private-run', profileId: 'private-profile',
    }]);
    const db = { getRepository: (entity: unknown) => entity === InterviewSession ? { findAndCount } : { find } };
    const service = new InterviewService({} as ConfigService, {} as RecruitmentService, db as unknown as DataSource);
    const result = await service.history('owner', { page: 2, pageSize: 1 });
    expect(findAndCount).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'owner' }, skip: 1, take: 1 }));
    expect(result.total).toBe(3);
    expect(result.items[0].result?.overallScore).toBe(79.2);
    expect(result.items[0].result?.strengths).toEqual(['API design']);
    expect(JSON.stringify(result)).not.toMatch(/private-run|private-profile|rubric|answerText/);
  });

  it('returns an empty history without querying another user or all results', async () => {
    const find = jest.fn();
    const db = { getRepository: (entity: unknown) => entity === InterviewSession
      ? { findAndCount: jest.fn().mockResolvedValue([[], 0]) } : { find } };
    const service = new InterviewService({} as ConfigService, {} as RecruitmentService, db as unknown as DataSource);
    await expect(service.history('new-user', { page: 1, pageSize: 10 })).resolves.toEqual({ items: [], total: 0 });
    expect(find).not.toHaveBeenCalled();
  });
});
