import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { PermissionsService } from '../rbac/permissions.service';
import { RecruitmentRoundsService } from './recruitment-rounds.service';

describe('Recruitment round opening feedback', () => {
  it('returns an actionable error without opening a draft that has no future slot', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const service = new RecruitmentRoundsService(
      { query } as unknown as DataSource,
      {} as PermissionsService,
    );
    jest.spyOn(service, 'authorize').mockResolvedValue({
      id: 'round', ownerId: 'teacher', name: 'QA', status: 'draft',
      opensAt: new Date(), closesAt: new Date(),
    });

    const error = await service.status('teacher', 'round', 'open').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      code: 'RECRUITMENT_ROUND_SLOT_REQUIRED',
    });
    expect(query.mock.calls.some(([sql]) => String(sql).startsWith('UPDATE recruitment_rounds'))).toBe(false);
  });
});
