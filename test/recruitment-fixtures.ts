import { DataSource } from 'typeorm';
import { RecruitmentProfile } from '../src/recruitment/entities/recruitment-profile.entity';

/**
 * Phase 4 test fixture (spec 47): seeds a PASSED recruitment profile for
 * an intern WITHOUT running the AI flow. This encodes the INTENTIONAL
 * domain evolution — "intern RBAC role" no longer implies workspace access;
 * only a passed profile does. Suites that test assignment/sprint/task
 * behavior seed this directly; the recruitment e2e proves the real flow.
 */
export async function ensureRecruitedProfile(
  ds: DataSource,
  userId: string,
  role = 'frontend',
): Promise<RecruitmentProfile> {
  const repo = ds.getRepository(RecruitmentProfile);
  const existing = await repo.findOne({ where: { userId } });
  if (existing) {
    if (existing.status !== 'passed') {
      existing.status = 'passed';
      existing.recruitedAt = existing.recruitedAt ?? new Date();
      await repo.save(existing);
    }
    return existing;
  }
  return repo.save(
    repo.create({
      userId,
      selectedRole: role,
      status: 'passed',
      attemptCount: 1,
      recruitedAt: new Date(),
    }),
  );
}

/** Resolve a user id by email (fixtures are created by the suites first). */
export async function userIdByEmail(ds: DataSource, email: string): Promise<string> {
  const row = (await ds.query(
    `SELECT id FROM users WHERE email = @0`,
    [email],
  )) as Array<{ id: string }>;
  if (!row[0]) throw new Error(`fixture user missing: ${email}`);
  return row[0].id;
}
