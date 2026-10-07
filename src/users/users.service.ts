import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { hash } from 'bcryptjs';
import { User, UserStatus } from './entities/user.entity';
import { Role } from '../rbac/entities/role.entity';
import { UserRole } from '../rbac/entities/user-role.entity';
import { ActivityService } from '../audit/activity.service';
import { AuditService } from '../audit/audit.service';
import { isUniqueViolation } from '../common/utils/db-errors';
import { toUserResponse, UserResponse } from './user-response';
import { NotificationsService } from '../notifications/notifications.service';

export interface ActorContext {
  actorId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

const BCRYPT_ROUNDS = 10;

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Role) private readonly roles: Repository<Role>,
    @InjectRepository(UserRole) private readonly userRoles: Repository<UserRole>,
    private readonly audit: AuditService,
    private readonly activity: ActivityService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Used by JwtAuthGuard on EVERY request — only active accounts pass. */
  async findActiveById(id: string): Promise<User | null> {
    if (!id) return null;
    return this.users.findOne({ where: { id, status: 'active' } });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.users.findOne({ where: { email } });
  }

  async touchLastLogin(id: string): Promise<void> {
    await this.users.update(id, { lastLoginAt: new Date() });
  }

  async list(q: {
    page: number;
    pageSize: number;
    q?: string;
    status?: UserStatus;
  }): Promise<{ items: UserResponse[]; total: number }> {
    const qb = this.users.createQueryBuilder('u');
    if (q.q && q.q.length > 0) {
      const term = `%${q.q}%`;
      qb.andWhere('(u.email LIKE :term OR u.username LIKE :term OR u.displayName LIKE :term)', { term });
    }
    if (q.status) qb.andWhere('u.status = :status', { status: q.status });
    qb.orderBy('u.createdAt', 'DESC')
      .skip((q.page - 1) * q.pageSize)
      .take(q.pageSize);
    const [items, total] = await qb.getManyAndCount();
    return { items: items.map(toUserResponse), total };
  }

  async getOne(id: string): Promise<User> {
    const user = await this.users.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException({
        statusCode: 404,
        code: 'USER_NOT_FOUND',
        message: 'User not found.',
      });
    }
    return user;
  }

  async create(
    input: { email: string; username: string; displayName: string; password: string; roleCodes?: string[] },
    ctx: ActorContext,
  ): Promise<UserResponse> {
    const email = input.email.trim().toLowerCase();
    const existing = await this.users.findOne({ where: [{ email }, { username: input.username }] });
    if (existing) {
      throw new ConflictException({
        statusCode: 409,
        code: existing.email === email ? 'EMAIL_TAKEN' : 'USERNAME_TAKEN',
        message:
          existing.email === email
            ? 'Email is already registered.'
            : 'Username is already taken.',
      });
    }

    const passwordHash = await hash(input.password, BCRYPT_ROUNDS);
    let user: User;
    try {
      user = await this.users.save(
        this.users.create({
          email,
          username: input.username,
          displayName: input.displayName,
          passwordHash,
          status: 'active',
        }),
      );
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException({
          statusCode: 409,
          code: 'CONFLICT',
          message: 'Email or username already exists.',
        });
      }
      throw err;
    }

    await this.assignRoles(user.id, input.roleCodes ?? [], ctx);
    await this.notifications.notifyUsers([user.id], {
      type: 'system',
      title: 'Chào mừng đến V-Intern',
      body: 'Tài khoản của bạn đã được quản trị viên tạo. Hãy đổi mật khẩu sau lần đăng nhập đầu tiên.',
      category: 'system',
    });
    await this.audit.record({
      actorId: ctx.actorId ?? null,
      action: 'user.created',
      targetType: 'user',
      targetId: user.id,
      detail: { email, username: user.username },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    await this.activity.record({
      actorId: ctx.actorId ?? null,
      module: 'users',
      action: 'user.created',
      targetType: 'user',
      targetId: user.id,
      summary: `Tạo người dùng ${user.displayName}`,
    });
    return toUserResponse(user);
  }

  async update(
    id: string,
    input: { displayName?: string; username?: string },
    ctx: ActorContext,
  ): Promise<UserResponse> {
    const user = await this.getOne(id);
    const patch: Partial<User> = {};
    if (input.displayName !== undefined) patch.displayName = input.displayName;
    if (input.username !== undefined && input.username !== user.username) {
      patch.username = input.username;
    }
    if (Object.keys(patch).length > 0) {
      try {
        await this.users.update(id, patch);
      } catch (err) {
        if (isUniqueViolation(err)) {
          throw new ConflictException({
            statusCode: 409,
            code: 'USERNAME_TAKEN',
            message: 'Username is already taken.',
          });
        }
        throw err;
      }
      await this.audit.record({
        actorId: ctx.actorId ?? null,
        action: 'user.updated',
        targetType: 'user',
        targetId: id,
        detail: patch,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });
    }
    return toUserResponse(await this.getOne(id));
  }

  async setStatus(id: string, status: UserStatus, ctx: ActorContext): Promise<UserResponse> {
    if (ctx.actorId === id && status !== 'active') {
      throw new ConflictException({
        statusCode: 400,
        code: 'SELF_LOCK_FORBIDDEN',
        message: 'You cannot lock or delete your own account.',
      });
    }
    const user = await this.getOne(id);
    const from = user.status;
    await this.users.update(id, { status });
    await this.audit.record({
      actorId: ctx.actorId ?? null,
      action: 'user.status_changed',
      targetType: 'user',
      targetId: id,
      detail: { from, to: status },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    await this.activity.record({
      actorId: ctx.actorId ?? null,
      module: 'users',
      action: 'user.status_changed',
      targetType: 'user',
      targetId: id,
      summary: `${user.displayName}: ${from} → ${status}`,
    });
    return toUserResponse(await this.getOne(id));
  }

  /** Idempotent direct role assignment by role CODE (bootstrap/admin flows). */
  async assignRoles(userId: string, roleCodes: string[], ctx: ActorContext): Promise<string[]> {
    const wanted = [...new Set(roleCodes)];
    if (wanted.length === 0) return [];
    const roleEntities = await this.roles.find({ where: { code: In(wanted) } });
    const found = new Set(roleEntities.map((r) => r.code));
    const unknown = wanted.filter((c) => !found.has(c));
    if (unknown.length > 0) {
      throw new NotFoundException({
        statusCode: 404,
        code: 'ROLE_NOT_FOUND',
        message: `Unknown role(s): ${unknown.join(', ')}.`,
      });
    }
    const existing = await this.userRoles.find({ where: { userId } });
    const existingIds = new Set(existing.map((r) => r.roleId));
    const toAdd = roleEntities.filter((r) => !existingIds.has(r.id));
    if (toAdd.length > 0) {
      await this.userRoles.insert(toAdd.map((r) => ({ userId, roleId: r.id })));
    }
    await this.audit.record({
      actorId: ctx.actorId ?? null,
      action: 'user.role_assigned',
      targetType: 'user',
      targetId: userId,
      detail: { roles: toAdd.map((r) => r.code) },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return roleEntities.map((r) => r.code);
  }
}
