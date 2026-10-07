import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ActivityService } from '../audit/activity.service';
import { AuditService } from '../audit/audit.service';
import { isUniqueViolation } from '../common/utils/db-errors';
import { Role } from '../rbac/entities/role.entity';
import { User } from '../users/entities/user.entity';
import { ActorContext } from '../users/users.service';
import { GroupMember } from './entities/group-member.entity';
import { GroupRole } from './entities/group-role.entity';
import { UserGroup } from './entities/user-group.entity';

export interface GroupResponse {
  id: string;
  code: string;
  name: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toGroupResponse(g: UserGroup): GroupResponse {
  return {
    id: g.id,
    code: g.code,
    name: g.name,
    description: g.description ?? null,
    createdAt: g.createdAt,
    updatedAt: g.updatedAt,
  };
}

@Injectable()
export class GroupsService {
  constructor(
    @InjectRepository(UserGroup) private readonly groups: Repository<UserGroup>,
    @InjectRepository(GroupMember) private readonly members: Repository<GroupMember>,
    @InjectRepository(GroupRole) private readonly groupRoles: Repository<GroupRole>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Role) private readonly roles: Repository<Role>,
    private readonly audit: AuditService,
    private readonly activity: ActivityService,
  ) {}

  async list(q: { page: number; pageSize: number; q?: string }) {
    const qb = this.groups.createQueryBuilder('g');
    if (q.q && q.q.length > 0) {
      const term = `%${q.q}%`;
      qb.andWhere('(g.code LIKE :term OR g.name LIKE :term)', { term });
    }
    qb.orderBy('g.createdAt', 'ASC')
      .skip((q.page - 1) * q.pageSize)
      .take(q.pageSize);
    const [items, total] = await qb.getManyAndCount();
    return { items: items.map(toGroupResponse), total };
  }

  async getOne(id: string): Promise<UserGroup> {
    const group = await this.groups.findOne({ where: { id } });
    if (!group) {
      throw new NotFoundException({
        statusCode: 404,
        code: 'GROUP_NOT_FOUND',
        message: 'Group not found.',
      });
    }
    return group;
  }

  async create(input: { code: string; name: string; description?: string }, ctx: ActorContext) {
    const existing = await this.groups.findOne({ where: { code: input.code } });
    if (existing) {
      throw new ConflictException({
        statusCode: 409,
        code: 'GROUP_CODE_TAKEN',
        message: 'Group code is already taken.',
      });
    }
    let group: UserGroup;
    try {
      group = await this.groups.save(
        this.groups.create({
          code: input.code,
          name: input.name,
          description: input.description ?? null,
        }),
      );
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException({
          statusCode: 409,
          code: 'GROUP_CODE_TAKEN',
          message: 'Group code is already taken.',
        });
      }
      throw err;
    }
    await this.audit.record({
      actorId: ctx.actorId ?? null,
      action: 'group.created',
      targetType: 'user_group',
      targetId: group.id,
      detail: { code: group.code },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return toGroupResponse(group);
  }

  async update(id: string, input: { name?: string; description?: string }, ctx: ActorContext) {
    await this.getOne(id);
    const patch: Partial<UserGroup> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.description !== undefined) patch.description = input.description;
    if (Object.keys(patch).length > 0) {
      await this.groups.update(id, patch);
      await this.audit.record({
        actorId: ctx.actorId ?? null,
        action: 'group.updated',
        targetType: 'user_group',
        targetId: id,
        detail: patch,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });
    }
    return toGroupResponse(await this.getOne(id));
  }

  /** Idempotent membership add (existing members are skipped). */
  async addMembers(groupId: string, userIds: string[], ctx: ActorContext) {
    await this.getOne(groupId);
    const found = await this.users.find({ where: { id: In(userIds) } });
    const foundIds = new Set(found.map((u) => u.id));
    const unknown = userIds.filter((id) => !foundIds.has(id));
    if (unknown.length > 0) {
      throw new NotFoundException({
        statusCode: 404,
        code: 'USER_NOT_FOUND',
        message: `Unknown user id(s): ${unknown.slice(0, 5).join(', ')}${unknown.length > 5 ? '…' : ''}.`,
      });
    }
    const existing = await this.members.find({ where: { groupId, userId: In(userIds) } });
    const existingIds = new Set(existing.map((m) => m.userId));
    const toAdd = userIds.filter((id) => !existingIds.has(id));
    if (toAdd.length > 0) {
      await this.members.insert(toAdd.map((userId) => ({ groupId, userId })));
    }
    await this.audit.record({
      actorId: ctx.actorId ?? null,
      action: 'group.members_added',
      targetType: 'user_group',
      targetId: groupId,
      detail: { added: toAdd.length, skipped: existingIds.size },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    await this.activity.record({
      actorId: ctx.actorId ?? null,
      module: 'groups',
      action: 'group.members_added',
      targetType: 'user_group',
      targetId: groupId,
      summary: `Thêm ${toAdd.length} thành viên vào nhóm`,
    });
    return { added: toAdd.length, skipped: existingIds.size };
  }

  async removeMember(groupId: string, userId: string, ctx: ActorContext) {
    await this.getOne(groupId);
    const result = await this.members.delete({ groupId, userId });
    const removed = result.affected ?? 0;
    if (removed > 0) {
      await this.audit.record({
        actorId: ctx.actorId ?? null,
        action: 'group.member_removed',
        targetType: 'user_group',
        targetId: groupId,
        detail: { userId },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });
    }
    return { removed };
  }

  /** REPLACE strategy: requested role code set becomes the group's exact roles. */
  async setRoles(groupId: string, roleCodes: string[], ctx: ActorContext) {
    await this.getOne(groupId);
    const wanted = [...new Set(roleCodes)];
    const roleEntities = wanted.length > 0 ? await this.roles.find({ where: { code: In(wanted) } }) : [];
    const found = new Set(roleEntities.map((r) => r.code));
    const unknown = wanted.filter((c) => !found.has(c));
    if (unknown.length > 0) {
      throw new NotFoundException({
        statusCode: 404,
        code: 'ROLE_NOT_FOUND',
        message: `Unknown role(s): ${unknown.join(', ')}.`,
      });
    }
    await this.groupRoles.manager.transaction(async (em) => {
      await em.delete(GroupRole, { groupId });
      if (roleEntities.length > 0) {
        await em.insert(
          GroupRole,
          roleEntities.map((r) => ({ groupId, roleId: r.id })),
        );
      }
    });
    await this.audit.record({
      actorId: ctx.actorId ?? null,
      action: 'group.roles_set',
      targetType: 'user_group',
      targetId: groupId,
      detail: { roles: roleEntities.map((r) => r.code) },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return { roles: roleEntities.map((r) => r.code) };
  }

  async listMembers(groupId: string): Promise<Array<{ userId: string; joinedAt: Date }>> {
    await this.getOne(groupId);
    const rows = await this.members.find({ where: { groupId }, order: { joinedAt: 'ASC' } });
    return rows.map((m) => ({ userId: m.userId, joinedAt: m.joinedAt }));
  }
}
