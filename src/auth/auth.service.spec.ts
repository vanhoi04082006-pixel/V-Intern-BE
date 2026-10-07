import { HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Repository } from 'typeorm';
import { compare, hash } from 'bcryptjs';
import { AuthService } from './auth.service';
import { RefreshToken } from './entities/refresh-token.entity';
import { AuditService } from '../audit/audit.service';
import { PermissionsService } from '../rbac/permissions.service';
import { UsersService } from '../users/users.service';
import { User } from '../users/entities/user.entity';

/**
 * Spec 40 unit coverage (mocked repositories — no SQL Server required):
 * login success / failure / locked, refresh rotation, refresh REPLAY
 * (family revocation), expired + unknown refresh, logout revocation.
 */
const PASSWORD = 'Correct-Horse-9';

/** Assert an HttpException body {statusCode, code, message} (unified contract). */
async function expectCode(promise: Promise<unknown>, code: string, status?: number): Promise<void> {
  let caught: unknown;
  try {
    await promise;
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeInstanceOf(HttpException);
  const body = (caught as HttpException).getResponse() as Record<string, unknown>;
  expect(body.code).toBe(code);
  if (status !== undefined) expect((caught as HttpException).getStatus()).toBe(status);
}

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'u-1',
    email: 'user@vintern.edu.vn',
    username: 'user',
    displayName: 'Test User',
    passwordHash: '',
    status: 'active',
    lastLoginAt: null,
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2025-01-01T00:00:00Z'),
    ...overrides,
  } as User;
}

function makeExistingToken(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'rt-1',
    userId: 'u-1',
    tokenHash: 'known-hash',
    familyId: 'family-1',
    replacedById: null,
    expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    revokedAt: null,
    createdByIp: null,
    userAgent: null,
    createdAt: new Date(),
    ...overrides,
  } as RefreshToken;
}

interface HarnessMocks {
  usersFindByEmail: jest.Mock;
  usersFindActiveById: jest.Mock;
  auditRecord: jest.Mock;
  refreshFindOne: jest.Mock;
  refreshInsert: jest.Mock;
  refreshUpdate: jest.Mock;
}

function build(harness: Partial<HarnessMocks> = {}): { service: AuthService; mocks: HarnessMocks } {
  const mocks: HarnessMocks = {
    usersFindByEmail: jest.fn(),
    usersFindActiveById: jest.fn(),
    auditRecord: jest.fn().mockResolvedValue(undefined),
    refreshFindOne: jest.fn(),
    refreshInsert: jest.fn().mockResolvedValue(undefined),
    refreshUpdate: jest.fn().mockResolvedValue(undefined),
    ...harness,
  };

  const users = {
    findByEmail: mocks.usersFindByEmail,
    findActiveById: mocks.usersFindActiveById,
    touchLastLogin: jest.fn().mockResolvedValue(undefined),
  } as unknown as UsersService;

  const permissions = {
    buildPrincipal: jest.fn().mockResolvedValue({
      id: 'u-1',
      email: 'user@vintern.edu.vn',
      displayName: 'Test User',
      status: 'active',
      roles: ['intern'],
      permissions: [],
    }),
  } as unknown as PermissionsService;

  const audit = { record: mocks.auditRecord } as unknown as AuditService;

  const refreshRepo = {
    findOne: mocks.refreshFindOne,
    insert: mocks.refreshInsert,
    update: mocks.refreshUpdate,
    manager: {
      transaction: jest.fn(async (cb: (em: unknown) => Promise<unknown>) =>
        cb({
          save: jest.fn(async () => ({ id: 'rt-2' })),
          update: jest.fn().mockResolvedValue(undefined),
          create: jest.fn((_: unknown, data: Record<string, unknown>) => ({ ...data })),
        }),
      ),
    },
  } as unknown as Repository<RefreshToken>;

  const jwt = { signAsync: jest.fn().mockResolvedValue('access-token') } as unknown as JwtService;
  const config = { get: jest.fn((_k: string, d?: unknown) => d) } as unknown as ConfigService;

  const service = new AuthService(refreshRepo, users, jwt, permissions, audit, config);
  return { service, mocks };
}

const findByEmailReturning = (user: User | null) => (h: { mocks: HarnessMocks }) =>
  h.mocks.usersFindByEmail.mockResolvedValue(user);

describe('AuthService', () => {
  let passwordHash: string;

  beforeAll(async () => {
    passwordHash = await hash(PASSWORD, 10);
  });

  describe('login', () => {
    it('active user: access token + principal; refresh token persisted SHA-256 hashed', async () => {
      const h = build();
      findByEmailReturning(makeUser({ passwordHash }))(h);
      h.mocks.refreshInsert.mockImplementation(async (data: Record<string, unknown>) => {
        expect(String(data.tokenHash)).toMatch(/^[0-9a-f]{64}$/);
      });

      const result = await h.service.login({ email: 'USER@vintern.edu.vn', password: PASSWORD }, '1.2.3.4', 'ua');

      expect(result.accessToken).toBe('access-token');
      expect(result.user.roles).toEqual(['intern']);
      expect(result.refreshToken.length).toBeGreaterThan(30);
      expect(h.mocks.refreshInsert).toHaveBeenCalledTimes(1);
      expect(h.mocks.auditRecord).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'auth.login', actorId: 'u-1' }),
      );
    });

    it('unknown email → generic 401 INVALID_CREDENTIALS (no enumeration) + audit', async () => {
      const h = build();
      findByEmailReturning(null)(h);
      await expectCode(h.service.login({ email: 'ghost@x.vn', password: PASSWORD }, null, null), 'INVALID_CREDENTIALS', 401);
      expect(h.mocks.auditRecord).toHaveBeenCalledWith(expect.objectContaining({ action: 'auth.login_failed' }));
    });

    it('wrong password → generic 401 INVALID_CREDENTIALS', async () => {
      const h = build();
      findByEmailReturning(makeUser({ passwordHash }))(h);
      await expectCode(
        h.service.login({ email: 'user@vintern.edu.vn', password: 'wrong-password' }, null, null),
        'INVALID_CREDENTIALS',
        401,
      );
    });

    it('locked user → 403 ACCOUNT_LOCKED (distinct code, even with correct password)', async () => {
      const h = build();
      findByEmailReturning(makeUser({ passwordHash, status: 'locked' }))(h);
      await expectCode(h.service.login({ email: 'user@vintern.edu.vn', password: PASSWORD }, null, null), 'ACCOUNT_LOCKED', 403);
    });

    it('deleted user → 403 ACCOUNT_DELETED', async () => {
      const h = build();
      findByEmailReturning(makeUser({ passwordHash, status: 'deleted' }))(h);
      await expectCode(h.service.login({ email: 'user@vintern.edu.vn', password: PASSWORD }, null, null), 'ACCOUNT_DELETED', 403);
    });
  });

  describe('refresh (rotation + family reuse detection)', () => {
    it('valid token → rotated: new token in SAME family (transactional)', async () => {
      const h = build({
        usersFindActiveById: jest.fn().mockResolvedValue(makeUser({ passwordHash })),
      });
      h.mocks.refreshFindOne.mockResolvedValue(makeExistingToken());

      const result = await h.service.refresh('raw-token', 'ip', 'ua');

      expect(result.refreshToken.length).toBeGreaterThan(30);
      expect(h.mocks.auditRecord).toHaveBeenCalledWith(expect.objectContaining({ action: 'auth.refresh' }));
    });

    it('REPLAY of revoked token → revokes ENTIRE family + 401 REFRESH_REUSE', async () => {
      const h = build();
      h.mocks.refreshFindOne.mockResolvedValue(makeExistingToken({ revokedAt: new Date() }));

      await expectCode(h.service.refresh('raw-token', null, null), 'REFRESH_REUSE', 401);
      expect(h.mocks.refreshUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ familyId: 'family-1' }),
        expect.objectContaining({ revokedAt: expect.anything() }),
      );
      expect(h.mocks.auditRecord).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'auth.refresh_reuse_detected' }),
      );
    });

    it('expired token → 401 REFRESH_EXPIRED and token revoked', async () => {
      const h = build();
      h.mocks.refreshFindOne.mockResolvedValue(makeExistingToken({ expiresAt: new Date(Date.now() - 1000) }));

      await expectCode(h.service.refresh('raw-token', null, null), 'REFRESH_EXPIRED', 401);
      expect(h.mocks.refreshUpdate).toHaveBeenCalledWith('rt-1', { revokedAt: expect.anything() });
    });

    it('unknown token → 401 REFRESH_INVALID', async () => {
      const h = build();
      h.mocks.refreshFindOne.mockResolvedValue(null);
      await expectCode(h.service.refresh('bogus', null, null), 'REFRESH_INVALID', 401);
    });
  });

  describe('logout', () => {
    it('revokes the presented token and audits the event', async () => {
      const h = build();
      h.mocks.refreshFindOne.mockResolvedValue(makeExistingToken());
      await h.service.logout('raw-token', 'u-1', 'ip', 'ua');
      expect(h.mocks.refreshUpdate).toHaveBeenCalledWith('rt-1', { revokedAt: expect.anything() });
      expect(h.mocks.auditRecord).toHaveBeenCalledWith(expect.objectContaining({ action: 'auth.logout' }));
    });

    it('idempotent without a cookie', async () => {
      const h = build();
      await h.service.logout(null, null, null, null);
      expect(h.mocks.refreshFindOne).not.toHaveBeenCalled();
    });
  });

  it('bcryptjs compare sanity (async hashing library of the service)', async () => {
    expect(await compare(PASSWORD, passwordHash)).toBe(true);
    expect(await compare('wrong', passwordHash)).toBe(false);
  });
});
