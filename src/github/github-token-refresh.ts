import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import type { GithubConnection, GithubIdentity } from './github-auth.service';
import { GithubClient } from './github-client';
import { boundedJson, openToken, sealToken } from './github-security';
import { parseOAuthTokens } from './github-oauth-tokens';
export const CONNECTION_COLUMNS = 'userId,githubUserId,login,tokenCiphertext,scopes,expiresAt,refreshTokenCiphertext,refreshExpiresAt,tokenVersion';
export const canRefresh = (c: GithubConnection) => Boolean(c.refreshTokenCiphertext && c.refreshExpiresAt && c.refreshExpiresAt.getTime() > Date.now());
const reconnect = () => new ServiceUnavailableException({ code: 'GITHUB_RECONNECT_REQUIRED', message: 'Cần kết nối lại tài khoản GitHub.' });
const normalizeScopes = (value: string) => [...new Set(value.split(/[ ,]+/).filter(Boolean))].sort().join(' ');

export class GithubTokenRefresh {
  private readonly flights = new Map<string, Promise<GithubConnection>>();
  constructor(private readonly db: DataSource, private readonly config: ConfigService, private readonly client: GithubClient) {}
  async ensure(c: GithubConnection): Promise<GithubConnection> {
    if (!c.expiresAt || c.expiresAt.getTime() > Date.now() + (canRefresh(c) ? 30000 : 0)) return c;
    if (!canRefresh(c)) throw reconnect();
    const key = c.userId.toLowerCase(), pending = this.flights.get(key);
    if (pending) return pending;
    const result = this.rotate(c).finally(() => this.flights.delete(key)); this.flights.set(key, result); return result;
  }
  private async read(userId: string): Promise<GithubConnection | null> {
    const rows: GithubConnection[] = await this.db.query(`SELECT ${CONNECTION_COLUMNS} FROM github_connections WHERE userId=@0`, [userId]); return rows[0] ?? null;
  }
  private async rotate(prior: GithubConnection): Promise<GithubConnection> {
    const userId = prior.userId.toLowerCase(), version = prior.tokenVersion ?? 1, lease = randomUUID();
    const claimed: GithubConnection[] = await this.db.query(`UPDATE github_connections SET refreshLeaseId=@2,refreshLeaseExpiresAt=DATEADD(second,60,SYSUTCDATETIME())
      OUTPUT inserted.* WHERE userId=@0 AND tokenVersion=@1 AND refreshTokenCiphertext IS NOT NULL AND refreshExpiresAt>SYSUTCDATETIME()
      AND (refreshLeaseId IS NULL OR refreshLeaseExpiresAt<SYSUTCDATETIME()) AND EXISTS(SELECT 1 FROM users u WHERE u.id=@0 AND u.status='active')`, [userId, version, lease]);
    if (!claimed.length) {
      for (let attempt = 0; attempt < 8; attempt++) {
        const current = await this.read(userId);
        if (!current) throw reconnect();
        if (!current.expiresAt || current.expiresAt.getTime() > Date.now() + 5000) return current;
        if (!canRefresh(current)) throw reconnect();
        await new Promise(resolve => setTimeout(resolve, 150));
      }
      throw new ServiceUnavailableException({ code: 'GITHUB_REFRESH_IN_PROGRESS', message: 'GitHub đang gia hạn kết nối. Vui lòng thử lại.' });
    }
    const c = claimed[0], key = this.config.get<string>('GITHUB_TOKEN_ENCRYPTION_KEY', '');
    try {
      const response = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20000), headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: this.config.get('GITHUB_CLIENT_ID'), client_secret: this.config.get('GITHUB_CLIENT_SECRET'), grant_type: 'refresh_token', refresh_token: openToken(c.refreshTokenCiphertext!, key, `github-refresh:${userId}`) }),
      });
      if (!response.ok) { await response.body?.cancel(); throw new ServiceUnavailableException({ code: 'GITHUB_REFRESH_UNAVAILABLE', message: 'GitHub chưa gia hạn được kết nối. Vui lòng thử lại.' }); }
      const raw = await boundedJson(response, 64000);
      if (raw && typeof raw === 'object' && (raw as Record<string, unknown>).error === 'bad_refresh_token') {
        await this.db.query('UPDATE github_connections SET refreshTokenCiphertext=NULL,refreshExpiresAt=NULL WHERE userId=@0 AND tokenVersion=@1 AND refreshLeaseId=@2', [userId, version, lease]);
        throw reconnect();
      }
      const data = parseOAuthTokens(raw, true);
      if (data.scope !== undefined && normalizeScopes(data.scope) !== normalizeScopes(c.scopes)) throw reconnect();
      const identity = await this.client.call<GithubIdentity>('/user', data.access_token);
      if (!Number.isSafeInteger(identity.id) || String(identity.id) !== String(c.githubUserId) || !/^[a-zA-Z0-9-]{1,39}$/.test(identity.login)) throw reconnect();
      const updated: GithubConnection[] = await this.db.query(`UPDATE github_connections SET tokenCiphertext=@3,refreshTokenCiphertext=@4,expiresAt=@5,refreshExpiresAt=@6,login=@7,
        tokenVersion=tokenVersion+1,refreshLeaseId=NULL,refreshLeaseExpiresAt=NULL OUTPUT inserted.*
        WHERE userId=@0 AND tokenVersion=@1 AND refreshLeaseId=@2 AND EXISTS(SELECT 1 FROM users u WHERE u.id=@0 AND u.status='active')`,
        [userId, version, lease, sealToken(data.access_token, key, userId), sealToken(data.refresh_token!, key, `github-refresh:${userId}`), new Date(Date.now() + data.expires_in! * 1000), new Date(Date.now() + data.refresh_token_expires_in! * 1000), identity.login]);
      if (!updated.length) throw reconnect(); return updated[0];
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException({ code: 'GITHUB_REFRESH_UNAVAILABLE', message: 'GitHub chưa gia hạn được kết nối. Vui lòng thử lại.' });
    } finally {
      await this.db.query('UPDATE github_connections SET refreshLeaseId=NULL,refreshLeaseExpiresAt=NULL WHERE userId=@0 AND tokenVersion=@1 AND refreshLeaseId=@2', [userId, version, lease]);
    }
  }
}
