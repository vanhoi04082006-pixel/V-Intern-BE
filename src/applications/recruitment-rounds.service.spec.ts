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

describe('Recruitment schedule UTC persistence', () => {
  const access = {
    accessSnapshot: jest.fn().mockResolvedValue({
      permissions: new Set(['applications.manage']), roles: new Set(['instructor']),
    }),
  } as unknown as PermissionsService;

  it.each([
    ['2030-11-17T09:00:00+07:00', '2030-11-17T10:00:00+07:00', '2030-11-17T02:00:00.000Z', '2030-11-17T03:00:00.000Z'],
    ['2030-11-17T02:00:00.000Z', '2030-11-17T03:00:00.000Z', '2030-11-17T02:00:00.000Z', '2030-11-17T03:00:00.000Z'],
  ])('stores round instants in UTC for %s', async (opensAt, closesAt, utcOpen, utcClose) => {
    const query = jest.fn().mockResolvedValue([]);
    const service = new RecruitmentRoundsService({ query } as unknown as DataSource, access);
    jest.spyOn(service, 'detail').mockResolvedValue({} as Awaited<ReturnType<typeof service.detail>>);

    await service.create('teacher', { name: 'UTC regression', opensAt, closesAt });

    expect(query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO recruitment_rounds'), [expect.any(String), 'teacher', 'UTC regression', utcOpen, utcClose]);
  });

  it.each([
    ['2030-11-17T09:00:00+07:00', '2030-11-17T10:00:00+07:00', '2030-11-17T02:00:00.000Z', '2030-11-17T03:00:00.000Z'],
    ['2030-11-17T02:00:00.000Z', '2030-11-17T03:00:00.000Z', '2030-11-17T02:00:00.000Z', '2030-11-17T03:00:00.000Z'],
  ])('stores slot instants in UTC for %s', async (startsAt, endsAt, utcStart, utcEnd) => {
    const query = jest.fn().mockResolvedValue([]);
    const service = new RecruitmentRoundsService({ query } as unknown as DataSource, access);
    jest.spyOn(service, 'authorize').mockResolvedValue({ id: 'round', ownerId: 'teacher', name: 'UTC', status: 'draft', opensAt: new Date('2030-11-16T00:00:00Z'), closesAt: new Date('2030-11-18T00:00:00Z') });
    jest.spyOn(service, 'readiness').mockResolvedValue(undefined);
    jest.spyOn(service, 'detail').mockResolvedValue({} as Awaited<ReturnType<typeof service.detail>>);

    await service.addSlot('teacher', 'round', { roleCode: 'frontend', startsAt, endsAt, timezone: 'Asia/Ho_Chi_Minh', capacity: 2, minimumPreparationMinutes: 60, credentialsLeadMinutes: 30 });

    expect(query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO interview_slots'), [expect.any(String), 'round', 'frontend', utcStart, utcEnd, 'Asia/Ho_Chi_Minh', 2, 60, 30]);
  });
});
