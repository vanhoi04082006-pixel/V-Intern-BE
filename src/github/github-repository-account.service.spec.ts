import { DataSource } from 'typeorm';
import { PermissionsService } from '../rbac/permissions.service';
import { GithubAuthService } from './github-auth.service';
import { GithubClient } from './github-client';
import { GithubRepositoryAccountService } from './github-repository-account.service';

function fixture(admin = true, selected = true, matchingIdentity = true) {
  const connection = { githubUserId: 101, login: 'platform-owner', scopes: 'read:user public_repo' };
  const query = jest.fn(async (sql: string): Promise<unknown[]> => {
    if (sql.includes('FROM github_connections')) return [{ githubUserId: 101 }];
    if (sql.includes('FROM github_repository_account')) return selected ? [{ userId: 'admin', githubUserId: matchingIdentity ? 101 : 999 }] : [];
    return [];
  });
  const db = { query, transaction: async (fn: (em: { query: typeof query }) => Promise<unknown>) => fn({ query }) };
  const auth = { token: jest.fn(async () => ({ token: 'secret-fixture', connection })), status: jest.fn(async () => ({ connected: true, login: connection.login, canCreatePublicRepo: true })) };
  const client = { call: jest.fn(async () => ({ id: 101, login: connection.login })) };
  const permissions = { hasRole: jest.fn(async () => admin) };
  const service = new GithubRepositoryAccountService(db as unknown as DataSource, auth as unknown as GithubAuthService, client as unknown as GithubClient, permissions as unknown as PermissionsService);
  return { service, query, auth, client, connection };
}

describe('Admin repository account', () => {
  it('only an administrator can select the repository account', async () => {
    const f = fixture(false);
    await expect(f.service.select('teacher')).rejects.toThrow();
    expect(f.client.call).not.toHaveBeenCalled();
    expect(f.query).not.toHaveBeenCalled();
  });
  it('stores only immutable account references and audits the selection', async () => {
    const f = fixture();
    await f.service.select('admin');
    expect(f.query.mock.calls.some(([sql]) => sql.includes('INSERT INTO audit_logs'))).toBe(true);
    expect(JSON.stringify(f.query.mock.calls)).not.toContain('secret-fixture');
  });
  it('does not fall back to an instructor when no central account is configured', async () => {
    const f = fixture(true, false);
    await expect(f.service.credentials()).rejects.toThrow();
    expect(f.auth.token).not.toHaveBeenCalled();
  });
  it('uses the selected administrator credential for new repositories', async () => {
    const f = fixture();
    expect((await f.service.credentials()).userId).toBe('admin');
    expect(f.auth.token).toHaveBeenCalledWith('admin');
  });
  it('rejects reconnecting the selected administrator to a different GitHub identity', async () => {
    const f = fixture(true, true, false);
    await expect(f.service.credentials()).rejects.toThrow();
  });
  it('rejects a central account after its administrator role is removed', async () => {
    const f = fixture(false);
    await expect(f.service.credentials()).rejects.toThrow();
  });
  it('requires a repository scope before selection', async () => {
    const f = fixture();
    f.connection.scopes = 'read:user';
    await expect(f.service.select('admin')).rejects.toThrow();
    expect(f.query).not.toHaveBeenCalled();
  });
});
