import { ConfigService } from '@nestjs/config';
import { createHmac, createHash } from 'crypto';
import { DataSource } from 'typeorm';
import { GithubAuthService } from './github-auth.service';
import { GithubClient } from './github-client';
import { GithubWebhookService } from './github-webhook.service';

describe('scoped webhook processing', () => {
  const secret = 'fixture-secret-for-signed-webhooks-32chars';
  const deliveryId = '11111111-1111-4111-8111-111111111111';
  function harness(known = true) {
    let receipt: unknown = null;
    const query = jest.fn(async (sql: string, params?: unknown[]) => {
      if (sql.includes('FROM github_webhook_deliveries')) return receipt ? [receipt] : [];
      if (sql.includes('FROM session_repositories')) return known ? [{ sessionId: 'session', ownerUserId: 'teacher', repoId: 12, githubOwnerId: 34 }] : [];
      if (sql.includes('INSERT INTO github_webhook_deliveries')) { receipt = { payloadHash: params?.[1], eventType: params?.[2], status: known ? 'processed' : 'ignored' }; return []; }
      if (sql.includes('OUTPUT inserted.id')) return [{ id: 'submission', internId: 'student' }];
      return [];
    });
    const db = { query, transaction: async (fn: (em: unknown) => unknown) => fn({ query, getRepository: () => ({ findOne: async () => null }), insert: jest.fn() }) };
    const config = { get: (key: string, fallback: unknown) => key === 'GITHUB_WEBHOOK_SECRET' ? secret : fallback };
    const service = new GithubWebhookService(db as unknown as DataSource, config as ConfigService, {} as GithubAuthService, {} as GithubClient);
    return { service, query };
  }
  const body = () => Buffer.from(JSON.stringify({ repository: { id: 12, owner: { id: 34 } }, action: 'synchronize', number: 3, pull_request: { head: { sha: 'b'.repeat(40) } } }));
  const sign = (raw: Buffer) => 'sha256=' + createHmac('sha256', secret).update(raw).digest('hex');
  it('processes a signed registered repository once and never rewrites the pinned submission head', async () => {
    const h = harness(), raw = body();
    expect(await h.service.consume(raw, sign(raw), deliveryId, 'pull_request')).toMatchObject({ status: 'processed', deduped: false });
    expect(await h.service.consume(raw, sign(raw), deliveryId, 'pull_request')).toMatchObject({ deduped: true });
    const writes = h.query.mock.calls.filter(([sql]) => sql.includes('OUTPUT inserted.id'));
    expect(writes).toHaveLength(1);
    expect(writes[0][0]).toContain('observedHeadSha');
    expect(writes[0][0]).not.toMatch(/SET\s+headSha\s*=/i);
  });
  it('ignores unknown repositories and rejects delivery-ID reuse with different signed content', async () => {
    const h = harness(false), raw = body();
    expect(await h.service.consume(raw, sign(raw), deliveryId, 'pull_request')).toMatchObject({ status: 'ignored' });
    expect(h.query.mock.calls.some(([sql]) => sql.includes('OUTPUT inserted.id'))).toBe(false);
    const changed = Buffer.from(raw.toString().replace('synchronize', 'reopened'));
    await expect(h.service.consume(changed, sign(changed), deliveryId, 'pull_request')).rejects.toThrow();
  });
});

describe('repository webhook registration trust boundaries', () => {
  const secret = 'fixture-only-hook-registration-secret-32chars', url = 'https://api.example.test/api/v1/github/webhook';
  function fixture(changedIdentity = false, ready = false) {
    const repository = { sessionId: 'session', ownerUserId: 'owner', githubOwnerId: 34, repoId: 12, ownerLogin: 'teacher', repoName: 'learning', status: 'ready', webhookStatus: ready ? 'ready' : 'not_configured', webhookConfigHash: createHash('sha256').update(url + '\0' + secret).digest('hex') };
    const query = jest.fn(async (sql: string) => sql.startsWith('SELECT') ? [repository] : []);
    const db = { query, transaction: async (fn: (em: unknown) => unknown) => fn({ query }) };
    const config = new ConfigService({ GITHUB_WEBHOOK_SECRET: secret, GITHUB_WEBHOOK_URL: url });
    const call = jest.fn(async (path: string, _token: string, method = 'GET') => {
      if (path === '/user') return { id: changedIdentity ? 99 : 34 };
      if (path.endsWith('/hooks?per_page=100')) return [{ id: 7, name: 'web', config: { url }, active: true, events: ['push'] }];
      if (method === 'PATCH') return { id: 7, name: 'web', config: { url }, active: true, events: ['push', 'pull_request', 'check_suite', 'workflow_run'] };
      return { id: 12, owner: { id: 34 }, private: false };
    });
    const auth = { token: jest.fn(async () => ({ token: 'test-only-token', connection: { githubUserId: 34 } })) };
    return { service: new GithubWebhookService(db as unknown as DataSource, config, auth as unknown as GithubAuthService, { call } as unknown as GithubClient), call, query };
  }
  it('updates only the matching application hook and reuses an already confirmed configuration', async () => {
    const h = fixture(); await h.service.register('session', 'owner');
    expect(h.call.mock.calls.some(call => call[2] === 'PATCH')).toBe(true);
    expect(h.call.mock.calls.some(call => call[2] === 'POST')).toBe(false);
    expect(h.query.mock.calls.at(-1)?.[0]).toContain("webhookStatus='ready'");
    const cached = fixture(false, true); await cached.service.register('session', 'owner');
    expect(cached.call).not.toHaveBeenCalled();
  });
  it('refuses a foreign application user or changed GitHub identity before mutating hooks', async () => {
    const foreign = fixture(); await expect(foreign.service.register('session', 'another-user')).rejects.toThrow();
    expect(foreign.call).not.toHaveBeenCalled();
    const changed = fixture(true); await changed.service.register('session', 'owner');
    expect(changed.call.mock.calls.some(call => call[2] === 'PATCH' || call[2] === 'POST')).toBe(false);
    expect(changed.query.mock.calls.at(-1)?.[0]).toContain("webhookStatus='failed'");
  });
});
