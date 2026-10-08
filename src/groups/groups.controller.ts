import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { toPaginated } from '../common/pagination/paginated';
import { clientIp, userAgent } from '../common/types/request-info';
import { ActorContext } from '../users/users.service';
import { GroupsService } from './groups.service';
import { AddGroupMembersDto, CreateGroupDto, SetGroupRolesDto, UpdateGroupDto, QueryGroupsDto } from './dto/group.dtos';

@ApiTags('groups')
@ApiBearerAuth()
@Controller('groups')
export class GroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  private ctx(req: Request, actorId: string): ActorContext {
    return { actorId, ip: clientIp(req), userAgent: userAgent(req) };
  }

  @Get()
  @RequirePermissions('groups.read')
  @ApiOperation({ summary: 'Paginated groups (groups.read)' })
  async list(@Query() query: QueryGroupsDto) {
    const { items, total } = await this.groupsService.list({
      page: query.page,
      pageSize: query.pageSize,
      q: query.q,
    });
    return toPaginated(items, query.page, query.pageSize, total);
  }

  @Post()
  @RequirePermissions('groups.manage')
  @ApiOperation({ summary: 'Create group (groups.manage; audited)' })
  async create(
    @Body() dto: CreateGroupDto,
    @CurrentUser('userId') actorId: string,
    @Req() req: Request,
  ) {
    return this.groupsService.create(dto, this.ctx(req, actorId));
  }

  @Patch(':id')
  @RequirePermissions('groups.manage')
  @ApiOperation({ summary: 'Update group (groups.manage; audited)' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateGroupDto,
    @CurrentUser('userId') actorId: string,
    @Req() req: Request,
  ) {
    return this.groupsService.update(id, dto, this.ctx(req, actorId));
  }

  @Get(':id/members')
  @RequirePermissions('groups.read')
  @ApiOperation({ summary: 'List group members (groups.read)' })
  async members(@Param('id', ParseUUIDPipe) id: string) {
    return { members: await this.groupsService.listMembers(id) };
  }

  @Post(':id/members')
  @RequirePermissions('groups.manage')
  @ApiOperation({ summary: 'Add members (idempotent; audited)' })
  async addMembers(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddGroupMembersDto,
    @CurrentUser('userId') actorId: string,
    @Req() req: Request,
  ) {
    return this.groupsService.addMembers(id, dto.userIds, this.ctx(req, actorId));
  }

  @Delete(':id/members/:userId')
  @RequirePermissions('groups.manage')
  @ApiOperation({ summary: 'Remove member (audited)' })
  async removeMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser('userId') actorId: string,
    @Req() req: Request,
  ) {
    return this.groupsService.removeMember(id, userId, this.ctx(req, actorId));
  }

  @Put(':id/roles')
  @RequirePermissions('groups.manage')
  @ApiOperation({ summary: 'Replace group role set (groups.manage; audited)' })
  async setRoles(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetGroupRolesDto,
    @CurrentUser('userId') actorId: string,
    @Req() req: Request,
  ) {
    return this.groupsService.setRoles(id, dto.roleCodes, this.ctx(req, actorId));
  }

  @Get(':id/roles')
  @RequirePermissions('groups.read')
  @ApiOperation({ summary: 'Actual role codes granted to a group (groups.read)' })
  async roles(@Param('id', ParseUUIDPipe) id: string) {
    return { roles: await this.groupsService.listRoles(id) };
  }
}
