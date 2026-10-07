import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { IsNull, Repository } from 'typeorm';
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
    const existing = await this.refreshTokens.findOne({ where: { tokenHash } });

    if (!existing) {
      throw new UnauthorizedException({
        statusCode: 401,
        code: AUTH_ERROR_CODES.REFRESH_INVALID,
        message: 'Refresh token is not recognized.',
      });
    }

    if (existing.revokedAt !== null) {
      await this.refreshTokens.update(
        { familyId: existing.familyId, revokedAt: IsNull() },
        { revokedAt: new Date() },
      );
      await this.audit.record({
        actorId: existing.userId,
        action: 'auth.refresh_reuse_detected',
        targetType: 'refresh_token',
        targetId: existing.familyId,
        detail: { familyId: existing.familyId },
        ip,
        userAgent: ua,
      });
      throw new UnauthorizedException({
        statusCode: 401,
        code: AUTH_ERROR_CODES.REFRESH_REUSE,
        message: 'Refresh token was already used. Session family revoked.',
      });
    }

    if (existing.expiresAt.getTime() <= Date.now()) {
      await this.refreshTokens.update(existing.id, { revokedAt: new Date() });
      throw new UnauthorizedException({
        statusCode: 401,
        code: AUTH_ERROR_CODES.REFRESH_EXPIRED,
        message: 'Refresh token expired.',
      });
    }

    const user = await this.users.findActiveById(existing.userId);
    if (!user) {
      await this.refreshTokens.update(
        { familyId: existing.familyId, revokedAt: IsNull() },
        { revokedAt: new Date() },
      );
      throw new UnauthorizedException({
        statusCode: 401,
        code: AUTH_ERROR_CODES.ACCOUNT_UNAVAILABLE,
        message: 'Account is not available.',
      });
    }

    const newRaw = randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
    const newToken = await this.refreshTokens.manager.transaction(async (em) => {
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
      return created;
    });

    await this.audit.record({
      actorId: user.id,
      action: 'auth.refresh',
      targetType: 'refresh_token',
      targetId: newToken.id,
      detail: { familyId: existing.familyId },
      ip,
      userAgent: ua,
    });

    return {
      accessToken: await this.signAccessToken(user),
      refreshToken: newRaw,
      user: await this.permissions.buildPrincipal(user),
    };
  }

  async logout(rawToken: string | null, actorId: string | null, ip: string | null, ua: string | null): Promise<void> {
    if (rawToken) {
      const tokenHash = this.sha256(rawToken);
      const existing = await this.refreshTokens.findOne({ where: { tokenHash } });
      if (existing && existing.revokedAt === null) {
        await this.refreshTokens.update(existing.id, { revokedAt: new Date() });
      }
    }
    if (actorId) {
      await this.audit.record({
        actorId,
        action: 'auth.logout',
        targetType: 'user',
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
