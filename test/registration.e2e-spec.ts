import { randomUUID } from 'crypto';
import { compare } from 'bcryptjs';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import source from '../src/database/data-source';
import { ensureRbac } from '../src/bootstrap/ensure-rbac';
const password = 'Registration-123!', base = '/api/v1/auth/register';
let db: DataSource, app: INestApplication;
beforeAll(async () => {
  const database = process.env.E2E_DB_NAME ?? '';
  if (!/^VIntern_E2E_[A-Za-z0-9_]+$/.test(database) || source.options.type !== 'mssql') throw Error('Disposable SQL database required.');
  db = new DataSource({ ...source.options, database }); await db.initialize(); await db.runMigrations({ transaction: 'all' }); await ensureRbac(db);
  const module = await Test.createTestingModule({ imports: [AppModule] }).compile(); app = module.createNestApplication({ logger: false });
  app.setGlobalPrefix('api'); app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' }); app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true })); await app.init();
}, 120000);
afterAll(async () => { await app?.close(); if (db?.isInitialized) await db.destroy(); });
const payload = () => ({ fullName: 'Sinh viên đăng ký', email: `signup.${randomUUID()}@vintern.test`, password, acceptedTerms: true });
describe('public intern registration', () => {
  it('creates only an intern atomically, hashes the password, then logs in into recruitment', async () => {
    const data = payload(); data.email = ' ' + data.email.toUpperCase() + ' ';
    const registered = await request(app.getHttpServer()).post(base).send(data).expect(201);
    expect(registered.body).toEqual({ registered: true }); expect(registered.headers['set-cookie']).toBeUndefined();
    const [user] = await db.query('SELECT * FROM users WHERE email=@0', [data.email.trim().toLowerCase()]);
    expect(user.status).toBe('active'); expect(user.displayName).toBe(data.fullName); expect(await compare(password, user.passwordHash)).toBe(true); expect(user.passwordHash).not.toBe(password);
    const roles = await db.query('SELECT r.code FROM user_roles ur JOIN roles r ON r.id=ur.roleId WHERE ur.userId=@0', [user.id]); expect(roles).toEqual([{ code: 'intern' }]);
    const login = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: user.email, password }).expect(200);
    expect(login.body.user.roles).toEqual(['intern']); expect(login.body.user.permissions).not.toContain('users.create');
    const workspace = await request(app.getHttpServer()).get('/api/v1/intern/me/workspace').set('Authorization', `Bearer ${login.body.accessToken}`).expect(200);
    expect(workspace.body).toMatchObject({ status: 'recruitment_required', hasAssignmentHistory: false, assignment: null, recruitment: { attemptCount: 0, selectedRole: null } });
    await request(app.getHttpServer()).get('/api/v1/admin/question-bank').set('Authorization', `Bearer ${login.body.accessToken}`).expect(403);
    const [audit] = await db.query("SELECT detail FROM audit_logs WHERE targetId=@0 AND action='auth.register'", [user.id]); expect(audit.detail).not.toContain(password);
  });
  it('serializes concurrent duplicate email registrations into one user and one audit', async () => {
    const data = payload();
    const results = await Promise.all([request(app.getHttpServer()).post(base).send(data), request(app.getHttpServer()).post(base).send({ ...data, email: data.email.toUpperCase() })]);
    expect(results.map(r => r.status).sort()).toEqual([201, 409]);
    const [count] = await db.query('SELECT COUNT(*) n FROM users WHERE email=@0', [data.email]); expect(count.n).toBe(1);
    const [audit] = await db.query("SELECT COUNT(*) n FROM audit_logs a JOIN users u ON a.targetId=CONVERT(nvarchar(36),u.id) WHERE u.email=@0 AND a.action='auth.register'", [data.email]); expect(audit.n).toBe(1);
  });
  it('rejects privilege fields, invalid consent, weak/oversized passwords and invalid identity', async () => {
    for (const changes of [{ role: 'admin' }, { roleCodes: ['admin'] }, { status: 'active' }, { acceptedTerms: false }, { acceptedTerms: 'true' }, { fullName: ' ' }, { email: 'not-email' }, { password: 'short' }, { password: ' '.repeat(8) }, { password: '🔥'.repeat(20) }]) {
      const data = { ...payload(), ...changes }; await request(app.getHttpServer()).post(base).send(data).expect(400);
      const [count] = await db.query('SELECT COUNT(*) n FROM users WHERE email=@0', [data.email]); expect(count.n).toBe(0);
    }
  });
  it('honors the operator switch without creating a user', async () => {
    const config = app.get(ConfigService), get = config.get.bind(config);
    const spy = jest.spyOn(config, 'get').mockImplementation((key: string, fallback?: unknown) => key === 'AUTH_PUBLIC_REGISTRATION' ? 'false' : get(key, fallback));
    const data = payload();
    try {
      await request(app.getHttpServer()).post(base).send(data).expect(403);
      const [count] = await db.query('SELECT COUNT(*) n FROM users WHERE email=@0', [data.email]); expect(count.n).toBe(0);
    } finally { spy.mockRestore(); }
  });
});
