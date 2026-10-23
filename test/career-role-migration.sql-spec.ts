import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import source from '../src/database/data-source';
import { CreateCareerRoles1762636800000 } from '../src/database/migrations/1762636800000-CreateCareerRoles';
import { CareerRole } from '../src/career-roles/entities/career-role.entity';
import { CareerRoleRevision } from '../src/career-roles/entities/career-role-revision.entity';

const legacyCodes = ['backend', 'business_analyst', 'frontend', 'fullstack', 'qa'];
let db: DataSource;
const userId = randomUUID(), profileId = randomUUID(), sessionId = randomUUID(), questionId = randomUUID();
let rbacCount: number;
const importedCode = 'legacy_mobile';

beforeAll(async () => {
  const database = process.env.E2E_DB_NAME ?? '';
  if (!/^VIntern_(?:E2E|Test)_CareerRoles_[A-Za-z0-9_]+$/.test(database)) throw Error('Dedicated career-role migration database required.');
  if (source.options.type !== 'mssql' || !Array.isArray(source.options.migrations)) throw Error('SQL Server migrations required.');
  db = new DataSource({ ...source.options, database, migrations: source.options.migrations.filter(m => m !== CreateCareerRoles1762636800000), synchronize: false });
  await db.initialize();
  await db.runMigrations({ transaction: 'all' });
  if (await tableExists('career_roles')) throw Error('Use a fresh dedicated database; never reset an existing one.');
  await db.query("INSERT INTO users(id,email,username,displayName,passwordHash,status) VALUES(@0,@1,@2,N'Role migration history','not-a-login-hash','active')", [userId, `${userId}@vintern.test`, userId]);
  await db.query("INSERT INTO recruitment_profiles(id,userId,selectedRole,status,attemptCount) VALUES(@0,@1,@2,'failed',2)", [profileId, userId, importedCode]);
  await db.query("INSERT INTO interview_sessions(id,userId,profileId,roleCode,status,attemptNumber,questionCount) VALUES(@0,@1,@2,@3,'completed',2,1)", [sessionId, userId, profileId, importedCode]);
  await db.query("INSERT INTO interview_questions(id,roleCode,category,difficulty,prompt,rubricJson) VALUES(@0,@1,'technical','easy',N'Historical prompt',N'{\"answer\":\"snapshot-preserved\"}')", [questionId, importedCode]);
  [{ count: rbacCount }] = await db.query('SELECT COUNT(*) count FROM roles');
  // TypeORM builds its migration instances at initialize(), not setOptions().
  await db.destroy();
  db = new DataSource({ ...source.options, database, synchronize: false });
  await db.initialize();
  await db.runMigrations({ transaction: 'all' });
}, 120000);
afterAll(async () => { if (db?.isInitialized) await db.destroy(); });
async function tableExists(name: string): Promise<boolean> {
  const [row] = await db.query("SELECT OBJECT_ID(@0,'U') id", [name]);
  return row.id !== null;
}

describe('career-role migration on real SQL Server', () => {
  it('seeds stable careers without granting RBAC and registers both entity mappings', async () => {
    const roles = await db.getRepository(CareerRole).find({ where: { status: 'published' }, order: { code: 'ASC' } });
    expect(roles.map(r => r.code)).toEqual(legacyCodes);
    expect(roles.every(r => r.version === 1 && r.acceptingApplications)).toBe(true);
    expect(roles.find(r => r.code === 'business_analyst')?.name).toBe('Business Analyst');
    expect((await db.query('SELECT COUNT(*) count FROM roles'))[0].count).toBe(rbacCount);
    expect(await db.getRepository(CareerRoleRevision).count()).toBe(6);
    expect(await db.runMigrations({ transaction: 'all' })).toEqual([]);
  });

  it('imports unknown historical careers as archived while retaining attempts and evidence', async () => {
    const role = await db.getRepository(CareerRole).findOneByOrFail({ code: importedCode });
    expect(role).toMatchObject({ name: importedCode, status: 'archived', acceptingApplications: false, version: 1 });
    const revision = await db.getRepository(CareerRoleRevision).findOneByOrFail({ roleCode: importedCode, version: 1 });
    expect(JSON.parse(revision.snapshotJson)).toMatchObject({ code: importedCode, status: 'archived', version: 1 });
    expect((await db.query('SELECT selectedRole,attemptCount,status FROM recruitment_profiles WHERE id=@0', [profileId]))[0]).toEqual({ selectedRole: importedCode, attemptCount: 2, status: 'failed' });
    expect((await db.query('SELECT roleCode,status,attemptNumber FROM interview_sessions WHERE id=@0', [sessionId]))[0]).toEqual({ roleCode: importedCode, status: 'completed', attemptNumber: 2 });
    expect(JSON.parse((await db.query('SELECT rubricJson FROM interview_questions WHERE id=@0', [questionId]))[0].rubricJson)).toEqual({ answer: 'snapshot-preserved' });
  });

  it('prevents dangling references, invalid publishing state, invalid JSON and hard deletion', async () => {
    await expect(db.query('UPDATE recruitment_profiles SET selectedRole=@1 WHERE id=@0', [profileId, 'missing_career'])).rejects.toThrow();
    await expect(db.query('UPDATE interview_sessions SET roleCode=@1 WHERE id=@0', [sessionId, 'missing_career'])).rejects.toThrow();
    await expect(db.query('UPDATE interview_questions SET roleCode=@1 WHERE id=@0', [questionId, 'missing_career'])).rejects.toThrow();
    await expect(db.query('DELETE FROM career_roles WHERE code=@0', [importedCode])).rejects.toThrow();
    await expect(db.query("UPDATE career_roles SET acceptingApplications=1 WHERE code=@0", [importedCode])).rejects.toThrow();
    await expect(db.query("UPDATE career_roles SET requiredSkillsJson='not-json' WHERE code='frontend'")).rejects.toThrow();
    await expect(db.query("UPDATE career_roles SET version=0 WHERE code='frontend'")).rejects.toThrow();
    await expect(db.query("UPDATE career_role_revisions SET snapshotJson='not-json' WHERE roleCode='frontend'")).rejects.toThrow();
  });

  it('refuses lossy rollback for imported/new careers or modified metadata', async () => {
    await expect(db.undoLastMigration({ transaction: 'all' })).rejects.toThrow(/Preserve career-role/);
    expect(await db.getRepository(CareerRole).count()).toBe(6);
    await db.query('DELETE FROM interview_sessions WHERE id=@0', [sessionId]);
    await db.query('DELETE FROM recruitment_profiles WHERE id=@0', [profileId]);
    await db.query('DELETE FROM interview_questions WHERE id=@0', [questionId]);
    await db.query('DELETE FROM career_role_revisions WHERE roleCode=@0', [importedCode]);
    await db.query('DELETE FROM career_roles WHERE code=@0', [importedCode]);
    await db.query("UPDATE career_roles SET name=N'Edited name' WHERE code='frontend'");
    await expect(db.undoLastMigration({ transaction: 'all' })).rejects.toThrow(/Preserve career-role/);
    await db.query("UPDATE career_roles SET name=N'Frontend Developer' WHERE code='frontend'");
    await db.query("INSERT INTO career_role_revisions(roleCode,version,snapshotJson) SELECT roleCode,2,snapshotJson FROM career_role_revisions WHERE roleCode='frontend' AND version=1");
    await expect(db.undoLastMigration({ transaction: 'all' })).rejects.toThrow(/Preserve career-role/);
    await db.query("DELETE FROM career_role_revisions WHERE roleCode='frontend' AND version=2");
    await db.query("INSERT INTO career_roles(code,name,status) VALUES('data_science',N'Data Science','draft')");
    await expect(db.undoLastMigration({ transaction: 'all' })).rejects.toThrow(/Preserve career-role/);
    await db.query("DELETE FROM career_roles WHERE code='data_science'");
  });

  it('allows unchanged baseline rollback then reapplies without losing legacy recruitment tables', async () => {
    await db.undoLastMigration({ transaction: 'all' });
    expect(await tableExists('career_roles')).toBe(false);
    expect(await tableExists('interview_questions')).toBe(true);
    await db.runMigrations({ transaction: 'all' });
    expect(await db.getRepository(CareerRole).count()).toBe(5);
    expect(await db.getRepository(CareerRoleRevision).count()).toBe(5);
  });
});
