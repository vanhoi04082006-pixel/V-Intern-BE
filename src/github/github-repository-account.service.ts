import { ConflictException, ForbiddenException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { PermissionsService } from '../rbac/permissions.service';
import { GithubAuthService } from './github-auth.service';
import { GithubClient } from './github-client';

@Injectable()
export class GithubRepositoryAccountService {
  constructor(private readonly db: DataSource, private readonly auth: GithubAuthService,
    private readonly client: GithubClient, private readonly permissions: PermissionsService) {}

  private async selected(): Promise<{ userId: string; githubUserId: number | string } | null> {
    const rows = await this.db.query(`SELECT a.userId,a.githubUserId FROM github_repository_account a
      JOIN users u ON u.id=a.userId AND u.status='active' WHERE a.id=1`);
    return rows[0] ?? null;
  }
  async status() {
    const account = await this.selected();
    if (!account) return { configured: false, connected: false, login: null, ready: false };
    const state = await this.auth.status(account.userId);
    const connection = await this.auth.connection(account.userId);
    return { configured: true, connected: state.connected, login: state.login,
      ready: Boolean(state.canCreatePublicRepo && connection && String(connection.githubUserId) === String(account.githubUserId) && await this.permissions.hasRole(account.userId, 'admin')) };
  }
  async credentials() {
    const account = await this.selected();
    if (!account || !(await this.permissions.hasRole(account.userId, 'admin')))
      throw new ServiceUnavailableException({ code: 'GITHUB_ADMIN_ACCOUNT_REQUIRED', message: 'Admin cần kết nối và chọn tài khoản GitHub tạo repository chung.' });
    const credentials = await this.auth.token(account.userId);
    if (String(credentials.connection.githubUserId) !== String(account.githubUserId))
      throw new ConflictException('Tài khoản GitHub chung đã thay đổi. Admin cần xác nhận lại cấu hình.');
    return { userId: account.userId, ...credentials };
  }
  async select(actorId: string) {
    if (!(await this.permissions.hasRole(actorId, 'admin'))) throw new ForbiddenException('Chỉ Admin được cấu hình tài khoản tạo repository.');
    const { token, connection } = await this.auth.token(actorId);
    if (!connection.scopes.split(/[ ,]+/).some(scope => scope === 'public_repo' || scope === 'repo'))
      throw new ConflictException('Kết nối GitHub của Admin cần quyền tạo repository public.');
    const identity = await this.client.call<{ id: number; login: string }>('/user', token);
    if (String(identity.id) !== String(connection.githubUserId)) throw new ForbiddenException('Danh tính GitHub không khớp.');
    await this.db.transaction(async em => {
      const current = await em.query('SELECT githubUserId FROM github_connections WITH(UPDLOCK,HOLDLOCK) WHERE userId=@0', [actorId]);
      if (!current[0] || String(current[0].githubUserId) !== String(identity.id)) throw new ConflictException('Kết nối GitHub đã thay đổi. Hãy bắt đầu lại.');
      const rows = await em.query('SELECT id FROM github_repository_account WITH(UPDLOCK,HOLDLOCK) WHERE id=1');
      if (rows.length) await em.query('UPDATE github_repository_account SET userId=@0,githubUserId=@1,configuredBy=@0,updatedAt=SYSUTCDATETIME() WHERE id=1', [actorId, identity.id]);
      else await em.query('INSERT INTO github_repository_account(id,userId,githubUserId,configuredBy) VALUES(1,@0,@1,@0)', [actorId, identity.id]);
      await em.query("INSERT INTO audit_logs(actorId,action,targetType,targetId,detail) VALUES(@0,'github.repository_account.selected','github_repository_account','1',@1)", [actorId, JSON.stringify({ githubUserId: String(identity.id), login: identity.login })]);
    });
    return { configured: true, connected: true, login: identity.login, ready: true };
  }
}
