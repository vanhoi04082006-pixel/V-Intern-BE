import {
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { EntityManager, IsNull, Repository } from 'typeorm';
import { compare } from 'bcryptjs';
import { AuditService } from '../audit/audit.service';
import { User } from '../users/entities/user.entity';
import { PermissionsService } from '../rbac/permissions.service';
import { UsersService } from '../users/users.service';
import { SessionUser } from '../common/types/request-principal';
import { RefreshToken } from './entities/refresh-token.entity';
import { AUTH_ERROR_CODES } from './auth.constants';

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  user: SessionUser;
}

const REFRESH_TOKEN_BYTES = 48;
type RefreshOutcome =
  | { user: User; tokenId: string }
  | { code: string; message: string };

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(RefreshToken) private readonly refreshTokens: Repository<RefreshToken>,
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly permissions: PermissionsService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  private sha256(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  private refreshTtlMs(): number {
    const days = Number(this.config.get<string>('REFRESH_TOKEN_TTL_DAYS', '7'));
    return days * 24 * 60 * 60 * 1000;
  }

  private async signAccessToken(user: User): Promise<string> {
    return this.jwt.signAsync({ sub: user.id, email: user.email });
  }

  private static readonly GENERIC_401 = {
    statusCode: 401,
    code: AUTH_ERROR_CODES.INVALID_CREDENTIALS,
    message: 'Email or password is incorrect.',
  };

  async login(
    dto: { email: string; password: string },
    ip: string | null,
    ua: string | null,
  ): Promise<LoginResult> {
    const email = dto.email.trim().toLowerCase();
    const user = await this.users.findByEmail(email);

    if (!user) {
      await this.audit.record({
        action: 'auth.login_failed',
        targetType: 'user',
        detail: { email },
        ip,
        userAgent: ua,
      });
      throw new UnauthorizedException(AuthService.GENERIC_401);
    }

    if (user.status !== 'active') {
      const code =
        user.status === 'locked'
          ? AUTH_ERROR_CODES.ACCOUNT_LOCKED
          : user.status === 'pending'
            ? AUTH_ERROR_CODES.ACCOUNT_PENDING
            : AUTH_ERROR_CODES.ACCOUNT_DELETED;
      await this.audit.record({
        actorId: user.id,
        action: 'auth.login_rejected',
        targetType: 'user',
        targetId: user.id,
        detail: { reason: code },
        ip,
        userAgent: ua,
      });
      throw new ForbiddenException({
        statusCode: 403,
        code,
        message: 'Account is not active.',
      });
    }

    const passwordOk = await compare(dto.password, user.passwordHash);
    if (!passwordOk) {
      await this.audit.record({
        actorId: user.id,
        action: 'auth.login_failed',
        targetType: 'user',
        targetId: user.id,
        detail: { email },
        ip,
        userAgent: ua,
      });
      throw new UnauthorizedException(AuthService.GENERIC_401);
    }

    return this.issueSession(user, ip, ua);
  }

  /** New refresh family (login). Rotation continues within a family (refresh). */
  private async issueSession(
    user: User,
    ip: string | null,
    ua: string | null,
  ): Promise<LoginResult> {
    const refreshToken = randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
    await this.refreshTokens.insert({
      userId: user.id,
      tokenHash: this.sha256(refreshToken),
      familyId: randomUUID(),
      expiresAt: new Date(Date.now() + this.refreshTtlMs()),
      createdByIp: ip,
      userAgent: ua,
    });
    await this.users.touchLastLogin(user.id);
    await this.audit.record({
      actorId: user.id,
      action: 'auth.login',
      targetType: 'user',
      targetId: user.id,
      ip,
      userAgent: ua,
    });
    return {
      accessToken: await this.signAccessToken(user),
      refreshToken,
      user: await this.permissions.buildPrincipal(user),
    };
  }

  /**
   * Refresh with ROTATION + FAMILY REUSE DETECTION (improvement over the raw
   * snapshot which had rotation only):
   * - unknown token            → 401 REFRESH_INVALID
   * - revoked token (replay)   → revoke ENTIRE family → 401 REFRESH_REUSE
   * - expired token            → 401 REFRESH_EXPIRED
   * - valid token              → old revoked + replacedById set, new token
   *                              issued in the SAME family (transactional)
   */
  async refresh(
    rawToken: string,
    ip: string | null,
    ua: string | null,
  ): Promise<LoginResult> {
    const tokenHash = this.sha256(rawToken);
    const hint = await this.refreshTokens.findOne({ where: { tokenHash } });
    if (!hint)
      throw this.refreshError(
        AUTH_ERROR_CODES.REFRESH_INVALID,
        "Refresh token is not recognized.",
      );

    const newRaw = randomBytes(REFRESH_TOKEN_BYTES).toString("base64url");
    const outcome =
      await this.refreshTokens.manager.transaction<RefreshOutcome>(
        async (em) => {
          await this.lockRefreshFamily(em, hint.familyId);
          // The pre-transaction lookup identifies the lock only. Validate fresh SQL state
          // after acquiring it; rotation, replay and logout share this family lock.
          const existing = await em.findOne(RefreshToken, {
            where: { tokenHash },
          });
          if (!existing)
            return {
              code: AUTH_ERROR_CODES.REFRESH_INVALID,
              message: "Refresh token is not recognized.",
            };
          if (existing.revokedAt !== null) {
            await em.update(
              RefreshToken,
              { familyId: existing.familyId, revokedAt: IsNull() },
              { revokedAt: new Date() },
            );
            return {
              code: AUTH_ERROR_CODES.REFRESH_REUSE,
              message:
                "Refresh token was already used. Session family revoked.",
            };
          }
          if (existing.expiresAt.getTime() <= Date.now()) {
            await em.update(RefreshToken, existing.id, {
              revokedAt: new Date(),
            });
            return {
              code: AUTH_ERROR_CODES.REFRESH_EXPIRED,
              message: "Refresh token expired.",
            };
          }
          const user = await this.users.findActiveById(existing.userId);
          if (!user) {
            await em.update(
              RefreshToken,
              { familyId: existing.familyId, revokedAt: IsNull() },
              { revokedAt: new Date() },
            );
            return {
              code: AUTH_ERROR_CODES.ACCOUNT_UNAVAILABLE,
              message: "Account is not available.",
            };
          }
          const created = await em.save(
            em.create(RefreshToken, {
              userId: user.id,
              tokenHash: this.sha256(newRaw),
              familyId: existing.familyId,
              expiresAt: new Date(Date.now() + this.refreshTtlMs()),
              createdByIp: ip,
              userAgent: ua,
            }),
          );
          await em.update(RefreshToken, existing.id, {
            revokedAt: new Date(),
            replacedById: created.id,
          });
          return { user, tokenId: created.id };
        },
      );
    // Throw only after commit so replay/expiry revocations are not rolled back.
    if ("code" in outcome) {
      if (outcome.code === AUTH_ERROR_CODES.REFRESH_REUSE) {
        await this.audit.record({
          actorId: hint.userId,
          action: "auth.refresh_reuse_detected",
          targetType: "refresh_token",
          targetId: hint.familyId,
          detail: { familyId: hint.familyId },
          ip,
          userAgent: ua,
        });
      }
      throw this.refreshError(outcome.code, outcome.message);
    }
    await this.audit.record({
      actorId: outcome.user.id,
      action: "auth.refresh",
      targetType: "refresh_token",
      targetId: outcome.tokenId,
      detail: { familyId: hint.familyId },
      ip,
      userAgent: ua,
    });
    return {
      accessToken: await this.signAccessToken(outcome.user),
      refreshToken: newRaw,
      user: await this.permissions.buildPrincipal(outcome.user),
    };
  }

  private refreshError(code: string, message: string): UnauthorizedException {
    return new UnauthorizedException({ statusCode: 401, code, message });
  }

  private async lockRefreshFamily(
    em: EntityManager,
    familyId: string,
  ): Promise<void> {
    const rows: Array<{ result: number }> = await em.query(
      "DECLARE @result int; EXEC @result=sys.sp_getapplock @Resource=@0, @LockMode='Exclusive', @LockOwner='Transaction', @LockTimeout=10000; SELECT @result AS result;",
      ["vintern:refresh:" + familyId.toLowerCase()],
    );
    if (!rows.length || rows[0].result < 0) {
      throw new ServiceUnavailableException({
        statusCode: 503,
        code: "SESSION_BUSY",
        message: "Session is temporarily unavailable. Please retry.",
      });
    }
  }

  async logout(
    rawToken: string | null,
    actorId: string | null,
    ip: string | null,
    ua: string | null,
  ): Promise<void> {
    if (rawToken) {
      const tokenHash = this.sha256(rawToken);
      const existing = await this.refreshTokens.findOne({
        where: { tokenHash },
      });
      if (existing) {
        await this.refreshTokens.manager.transaction(async (em) => {
          await this.lockRefreshFamily(em, existing.familyId);
          // A cookie that was rotated in flight still identifies the session to end.
          await em.update(
            RefreshToken,
            { familyId: existing.familyId, revokedAt: IsNull() },
            { revokedAt: new Date() },
          );
        });
      }
    }
    if (actorId) {
      await this.audit.record({
        actorId,
        action: "auth.logout",
        targetType: "user",
        targetId: actorId,
        ip,
        userAgent: ua,
      });
    }
  }

  /** Fresh principal from the DB on every call (never from the JWT). */
  async me(userId: string): Promise<SessionUser> {
    const user = await this.users.findActiveById(userId);
    if (!user) {
      throw new UnauthorizedException({
        statusCode: 401,
        code: AUTH_ERROR_CODES.ACCOUNT_UNAVAILABLE,
        message: 'Account is no longer active.',
      });
    }
    return this.permissions.buildPrincipal(user);
  }
}
