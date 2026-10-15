import { randomBytes, randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import source from '../src/database/data-source';
import { User } from '../src/users/entities/user.entity';
import { GithubAuthService } from '../src/github/github-auth.service';
import { GithubClient } from '../src/github/github-client';
import { PermissionsService } from '../src/rbac/permissions.service';
import { openToken, sealToken } from '../src/github/github-security';
let db: DataSource, userId: string, first: GithubAuthService, second: GithubAuthService;
const identity = { id: Math.floor(Date.now() / 10), login: 'rotation-fixture' }, secret = randomBytes(32).toString('base64');
const config = new ConfigService({ GITHUB_CLIENT_ID: 'fixture-client', GITHUB_CLIENT_SECRET: 'fixture-secret', GITHUB_TOKEN_ENCRYPTION_KEY: secret, GITHUB_CALLBACK_URL: 'http://localhost:8080/api/v1/github/callback' });
const client = { call: jest.fn(async () => identity) }, permissions = { hasRole: async () => true } as unknown as PermissionsService;
const response = (changes: Record<string, unknown> = {}) => new Response(JSON.stringify({ access_token: 'rotated-access', refresh_token: 'rotated-refresh', expires_in: 28800, refresh_token_expires_in: 15897600, scope: 'read:user public_repo', token_type: 'bearer', ...changes }), { status: 200 });
const originalFetch = global.fetch;
beforeAll(async () => {
  const database = process.env.E2E_DB_NAME ?? '';
  if (!/^VIntern_E2E_[A-Za-z0-9_]+$/.test(database) || source.options.type !== 'mssql') throw Error('Disposable SQL database required.');
  db = new DataSource({ ...source.options, database }); await db.initialize(); await db.runMigrations({ transaction: 'all' });
  const suffix = randomUUID(), user = await db.getRepository(User).save({ email: `rotation.${suffix}@vintern.test`, username: `rotation.${suffix}`, displayName: 'Token rotation fixture', passwordHash: 'not-a-login-fixture', status: 'active' }); userId = user.id.toLowerCase();
}, 120000);
beforeEach(async () => {
  await db.getRepository(User).update(userId, { status: 'active' });
  await db.query('DELETE FROM github_oauth_states WHERE userId=@0', [userId]); await db.query('DELETE FROM github_connections WHERE userId=@0', [userId]);
  await db.query(`INSERT INTO github_connections(userId,githubUserId,login,tokenCiphertext,scopes,expiresAt,refreshTokenCiphertext,refreshExpiresAt)
    VALUES(@0,@1,@2,@3,'read:user public_repo',DATEADD(second,-1,SYSUTCDATETIME()),@4,DATEADD(day,10,SYSUTCDATETIME()))`, [userId, identity.id, identity.login, sealToken('old-access', secret, userId), sealToken('old-refresh', secret, `github-refresh:${userId}`)]);
  client.call.mockReset().mockResolvedValue(identity); global.fetch = jest.fn(async () => response()) as typeof fetch;
  first = new GithubAuthService(db, config, client as unknown as GithubClient, permissions); second = new GithubAuthService(db, config, client as unknown as GithubClient, permissions);
});
afterEach(() => { global.fetch = originalFetch; }); afterAll(async () => { if (db?.isInitialized) await db.destroy(); });
describe('SQL GitHub token rotation', () => {
  it('refreshes once across concurrent callers/workers, stores both tokens encrypted and verifies identity', async () => {
    global.fetch = jest.fn(async (_url, init) => { expect(JSON.parse(String(init?.body))).toMatchObject({ grant_type: 'refresh_token', refresh_token: 'old-refresh' }); await new Promise(resolve => setTimeout(resolve, 60)); return response(); }) as typeof fetch;
    const results = await Promise.all([first.token(userId), first.token(userId), second.token(userId)]);
    expect(results.map(r => r.token)).toEqual(['rotated-access', 'rotated-access', 'rotated-access']); expect(global.fetch).toHaveBeenCalledTimes(1); expect(client.call).toHaveBeenCalledWith('/user', 'rotated-access');
    const current = (await first.connection(userId))!; expect(current.tokenVersion).toBe(2); expect(JSON.stringify(current)).not.toContain('rotated-refresh'); expect(openToken(current.refreshTokenCiphertext!, secret, `github-refresh:${userId}`)).toBe('rotated-refresh');
    expect((await first.status(userId)).reconnectRequired).toBe(false);
  });
  it('supports legacy unexpired connections but requires reconnect when no refresh evidence exists', async () => {
    await db.query('UPDATE github_connections SET refreshTokenCiphertext=NULL,refreshExpiresAt=NULL WHERE userId=@0', [userId]);
    await expect(first.token(userId)).rejects.toMatchObject({ response: { code: 'GITHUB_RECONNECT_REQUIRED' } }); expect(global.fetch).not.toHaveBeenCalled();
    await db.query('UPDATE github_connections SET expiresAt=NULL WHERE userId=@0', [userId]); expect((await first.token(userId)).token).toBe('old-access');
  });
  it('persists the new expiring pair encrypted when the OAuth callback completes', async () => {
    const begin = await first.begin(userId); await first.finish('fixture-code', begin.state, begin.state);
    const current = (await first.connection(userId))!;
    expect(current.tokenVersion).toBe(2); expect(current.expiresAt!.getTime()).toBeGreaterThan(Date.now());
    expect(current.refreshTokenCiphertext).not.toContain('rotated-refresh');
    expect(openToken(current.refreshTokenCiphertext!, secret, `github-refresh:${userId}`)).toBe('rotated-refresh');
    expect((await first.token(userId)).token).toBe('rotated-access'); expect(global.fetch).toHaveBeenCalledTimes(1);
  });
  it('clears an invalid refresh token and gives an actionable reconnect state', async () => {
    global.fetch = jest.fn(async () => response({ error: 'bad_refresh_token' })) as typeof fetch;
    await expect(first.token(userId)).rejects.toMatchObject({ response: { code: 'GITHUB_RECONNECT_REQUIRED' } });
    expect((await first.connection(userId))?.refreshTokenCiphertext).toBeNull(); expect(await first.status(userId)).toMatchObject({ reconnectRequired: true, canCreatePublicRepo: false });
  });
  it.each(['identity', 'scope', 'malformed', 'provider'])('rejects %s changes without replacing the stored token', async problem => {
    if (problem === 'identity') client.call.mockResolvedValueOnce({ ...identity, id: identity.id + 1 });
    if (problem === 'scope') global.fetch = jest.fn(async () => response({ scope: 'repo read:user' })) as typeof fetch;
    if (problem === 'malformed') global.fetch = jest.fn(async () => new Response('{broken', { status: 200 })) as typeof fetch;
    if (problem === 'provider') global.fetch = jest.fn(async () => new Response('{}', { status: 503 })) as typeof fetch;
    await expect(first.token(userId)).rejects.toMatchObject({ status: 503 });
    const current = (await first.connection(userId))!; expect(current.tokenVersion).toBe(1); expect(openToken(current.tokenCiphertext, secret, userId)).toBe('old-access');
    expect((await db.query('SELECT refreshLeaseId FROM github_connections WHERE userId=@0', [userId]))[0].refreshLeaseId).toBeNull();
  });
  it('does not resurrect a connection disconnected while the refresh request is in flight', async () => {
    let release!: (response: Response) => void, entered!: () => void; const started = new Promise<void>(resolve => { entered = resolve; });
    global.fetch = jest.fn(() => { entered(); return new Promise<Response>(resolve => { release = resolve; }); }) as typeof fetch;
    const pending = first.token(userId); await started; await second.disconnect(userId); release(response());
    await expect(pending).rejects.toMatchObject({ response: { code: 'GITHUB_RECONNECT_REQUIRED' } }); expect(await first.connection(userId)).toBeNull();
  });
  it('does not resurrect a connection from a callback disconnected during its OAuth exchange', async () => {
    let release!: (response: Response) => void, entered!: () => void; const started = new Promise<void>(resolve => { entered = resolve; });
    global.fetch = jest.fn(() => { entered(); return new Promise<Response>(resolve => { release = resolve; }); }) as typeof fetch;
    const begin = await first.begin(userId), pending = first.finish('fixture-code', begin.state, begin.state);
    await started; await second.disconnect(userId); release(response());
    await expect(pending).rejects.toMatchObject({ status: 401 }); expect(await first.connection(userId)).toBeNull();
  });
  it('preserves a newer explicit reconnect when an older refresh completes late', async () => {
    let release!: (response: Response) => void, entered!: () => void; const started = new Promise<void>(resolve => { entered = resolve; });
    global.fetch = jest.fn((_url, init) => {
      if (JSON.parse(String(init?.body)).grant_type === 'refresh_token') { entered(); return new Promise<Response>(resolve => { release = resolve; }); }
      return Promise.resolve(response({ access_token: 'explicit-reconnect-access', refresh_token: 'explicit-reconnect-refresh' }));
    }) as typeof fetch;
    const pending = first.token(userId); await started;
    const begin = await second.begin(userId); await second.finish('new-code', begin.state, begin.state); release(response());
    await expect(pending).rejects.toMatchObject({ response: { code: 'GITHUB_RECONNECT_REQUIRED' } });
    expect((await first.token(userId)).token).toBe('explicit-reconnect-access');
  });
  it('rejects an older OAuth callback after another authorization changed the connection version', async () => {
    const old = await first.begin(userId), newer = await second.begin(userId);
    await second.finish('new-code', newer.state, newer.state);
    await expect(first.finish('old-code', old.state, old.state)).rejects.toMatchObject({ status: 409 });
    expect((await first.connection(userId))?.tokenVersion).toBe(2);
  });
  it('rechecks account activity after a pending OAuth exchange finishes', async () => {
    let release!: (response: Response) => void, entered!: () => void; const started = new Promise<void>(resolve => { entered = resolve; });
    global.fetch = jest.fn(() => { entered(); return new Promise<Response>(resolve => { release = resolve; }); }) as typeof fetch;
    const begin = await first.begin(userId), pending = first.finish('fixture-code', begin.state, begin.state);
    await started; await db.getRepository(User).update(userId, { status: 'locked' }); release(response());
    await expect(pending).rejects.toMatchObject({ status: 401 }); expect((await first.connection(userId))?.tokenVersion).toBe(1);
  });
});
