import { MigrationInterface, QueryRunner } from 'typeorm';

// Frozen migration baseline; do not import the mutable runtime catalog here.
const baseline = [
  ['frontend', 'Frontend Developer'], ['backend', 'Backend Developer'],
  ['fullstack', 'Fullstack Developer'], ['qa', 'QA Tester'], ['business_analyst', 'Business Analyst'],
] as const;
function initialSnapshot(code: string, name: string, imported = false) {
  return {
    code, name, description: '', level: 'intern', language: 'vi',
    requiredSkills: [], optionalSkills: [], competencyWeights: {},
    status: imported ? 'archived' : 'published', acceptingApplications: !imported, version: 1,
  };
}

export class CreateCareerRoles1762636800000 implements MigrationInterface {
  name = 'CreateCareerRoles1762636800000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE career_roles (
      code nvarchar(32) NOT NULL CONSTRAINT PK_career_roles PRIMARY KEY,
      name nvarchar(128) NOT NULL,
      description nvarchar(2000) NOT NULL CONSTRAINT DF_career_roles_description DEFAULT N'',
      level nvarchar(32) NOT NULL CONSTRAINT DF_career_roles_level DEFAULT N'intern',
      language nvarchar(16) NOT NULL CONSTRAINT DF_career_roles_language DEFAULT N'vi',
      requiredSkillsJson nvarchar(max) NOT NULL CONSTRAINT DF_career_roles_required DEFAULT N'[]',
      optionalSkillsJson nvarchar(max) NOT NULL CONSTRAINT DF_career_roles_optional DEFAULT N'[]',
      competencyWeightsJson nvarchar(max) NOT NULL CONSTRAINT DF_career_roles_weights DEFAULT N'{}',
      status nvarchar(16) NOT NULL CONSTRAINT DF_career_roles_status DEFAULT N'draft',
      acceptingApplications bit NOT NULL CONSTRAINT DF_career_roles_accepting DEFAULT 0,
      version int NOT NULL CONSTRAINT DF_career_roles_version DEFAULT 1,
      createdAt datetime2 NOT NULL CONSTRAINT DF_career_roles_created DEFAULT SYSUTCDATETIME(),
      updatedAt datetime2 NOT NULL CONSTRAINT DF_career_roles_updated DEFAULT SYSUTCDATETIME(),
      CONSTRAINT CK_career_roles_status CHECK (status IN ('draft','published','archived')),
      CONSTRAINT CK_career_roles_accepting CHECK (acceptingApplications=0 OR status='published'),
      CONSTRAINT CK_career_roles_version CHECK (version>0),
      CONSTRAINT CK_career_roles_required CHECK (ISJSON(requiredSkillsJson)=1),
      CONSTRAINT CK_career_roles_optional CHECK (ISJSON(optionalSkillsJson)=1),
      CONSTRAINT CK_career_roles_weights CHECK (ISJSON(competencyWeightsJson)=1)
    )`);
    await q.query('CREATE INDEX IX_career_roles_recruiting ON career_roles(status,acceptingApplications,code)');
    await q.query(`CREATE TABLE career_role_revisions (
      roleCode nvarchar(32) NOT NULL,
      version int NOT NULL,
      snapshotJson nvarchar(max) NOT NULL,
      createdBy uniqueidentifier NULL,
      createdAt datetime2 NOT NULL CONSTRAINT DF_career_role_revisions_created DEFAULT SYSUTCDATETIME(),
      CONSTRAINT PK_career_role_revisions PRIMARY KEY(roleCode,version),
      CONSTRAINT FK_career_role_revisions_role FOREIGN KEY(roleCode) REFERENCES career_roles(code),
      CONSTRAINT FK_career_role_revisions_actor FOREIGN KEY(createdBy) REFERENCES users(id),
      CONSTRAINT CK_career_role_revisions_version CHECK(version>0),
      CONSTRAINT CK_career_role_revisions_json CHECK(ISJSON(snapshotJson)=1)
    )`);
    for (const [code, label] of baseline) {
      await q.query("INSERT INTO career_roles(code,name,status,acceptingApplications) VALUES(@0,@1,'published',1)", [code, label]);
    }
    // Adopt existing custom codes without declaring them ready for new applicants.
    await q.query(`INSERT INTO career_roles(code,name,status)
      SELECT legacy.code,legacy.code,'archived' FROM (
        SELECT selectedRole code FROM recruitment_profiles WHERE selectedRole IS NOT NULL
        UNION SELECT roleCode FROM interview_questions
        UNION SELECT roleCode FROM interview_sessions
      ) legacy WHERE NOT EXISTS(SELECT 1 FROM career_roles r WHERE r.code=legacy.code)`);
    const rows: Array<{ code: string; name: string; status: string }> = await q.query('SELECT code,name,status FROM career_roles');
    for (const row of rows) {
      await q.query('INSERT INTO career_role_revisions(roleCode,version,snapshotJson) VALUES(@0,1,@1)', [row.code, JSON.stringify(initialSnapshot(row.code, row.name, row.status === 'archived'))]);
    }
    await q.query('ALTER TABLE recruitment_profiles ADD CONSTRAINT FK_recruitment_profiles_career FOREIGN KEY(selectedRole) REFERENCES career_roles(code)');
    await q.query('ALTER TABLE interview_questions ADD CONSTRAINT FK_interview_questions_career FOREIGN KEY(roleCode) REFERENCES career_roles(code)');
    await q.query('ALTER TABLE interview_sessions ADD CONSTRAINT FK_interview_sessions_career FOREIGN KEY(roleCode) REFERENCES career_roles(code)');
  }

  async down(q: QueryRunner): Promise<void> {
    const rows: Array<{ code: string; name: string; description: string; level: string; language: string; requiredSkillsJson: string; optionalSkillsJson: string; competencyWeightsJson: string; status: string; acceptingApplications: boolean; version: number }> = await q.query('SELECT * FROM career_roles WITH(TABLOCKX,HOLDLOCK)');
    const revisions: Array<{ roleCode: string; version: number; snapshotJson: string; createdBy: string | null }> = await q.query('SELECT * FROM career_role_revisions WITH(TABLOCKX,HOLDLOCK)');
    const untouched = rows.length === baseline.length && revisions.length === baseline.length && baseline.every(([code, name]) => {
      const row = rows.find(r => r.code === code), revision = revisions.find(r => r.roleCode === code);
      return row && revision && row.name === name && row.description === '' && row.level === 'intern' && row.language === 'vi'
        && row.requiredSkillsJson === '[]' && row.optionalSkillsJson === '[]' && row.competencyWeightsJson === '{}'
        && row.status === 'published' && row.acceptingApplications && row.version === 1
        && revision.version === 1 && revision.createdBy === null && revision.snapshotJson === JSON.stringify(initialSnapshot(code, name));
    });
    if (!untouched) throw new Error('Preserve career-role catalog/revisions before reverting this migration; only the untouched five-role baseline can be removed.');
    await q.query('ALTER TABLE interview_sessions DROP CONSTRAINT FK_interview_sessions_career');
    await q.query('ALTER TABLE interview_questions DROP CONSTRAINT FK_interview_questions_career');
    await q.query('ALTER TABLE recruitment_profiles DROP CONSTRAINT FK_recruitment_profiles_career');
    await q.query('DROP TABLE career_role_revisions');
    await q.query('DROP TABLE career_roles');
  }
}
