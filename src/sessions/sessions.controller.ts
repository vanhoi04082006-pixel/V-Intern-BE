import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
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
import {
  AddSessionInstructorsDto,
  AddSessionMembersDto,
  CreateMilestoneDto,
  CreateSessionDto,
  QuerySessionsDto,
  UpdateMilestoneDto,
  UpdateSessionDto,
} from './dto/session.dtos';
import { SessionsService, toSessionResponse } from './sessions.service';

@ApiTags('sessions')
@ApiBearerAuth()
@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  private ctx(req: Request, actorId: string): ActorContext {
    return { actorId, ip: clientIp(req), userAgent: userAgent(req) };
  }

  @Get()
  @RequirePermissions('sessions.view')
  @ApiOperation({ summary: 'Paginated sessions (sessions.view; filters: q, status)' })
  async list(@Query() query: QuerySessionsDto) {
    const { items, total } = await this.sessionsService.list({
      page: query.page,
      pageSize: query.pageSize,
      q: query.q,
      status: query.status,
    });
    return toPaginated(items, query.page, query.pageSize, total);
  }

  @Post()
  @RequirePermissions('sessions.manage')
  @ApiOperation({ summary: 'Create session (sessions.manage; audited)' })
  async create(
    @Body() dto: CreateSessionDto,
    @CurrentUser('userId') actorId: string,
    @Req() req: Request,
  ) {
    return this.sessionsService.create(dto, this.ctx(req, actorId));
  }

  @Get(':id')
  @RequirePermissions('sessions.view')
  @ApiOperation({ summary: 'Session detail (sessions.view)' })
  async getOne(@Param('id', ParseUUIDPipe) id: string) {
    return toSessionResponse(await this.sessionsService.getOne(id));
  }

  @Patch(':id')
  @RequirePermissions('sessions.manage')
  @ApiOperation({
    summary:
      'Update session (sessions.manage; status transitions enforced by the backend state machine — 409 INVALID_SESSION_TRANSITION)',
  })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSessionDto,
    @CurrentUser('userId') actorId: string,
    @Req() req: Request,
  ) {
    return this.sessionsService.update(id, dto, this.ctx(req, actorId));
  }

  @Get(':id/members')
  @RequirePermissions('sessions.view')
  @ApiOperation({ summary: 'Session members (sessions.view)' })
  async members(@Param('id', ParseUUIDPipe) id: string) {
    return { members: await this.sessionsService.listMembers(id) };
  }

  @Post(':id/members')
  @RequirePermissions('sessions.manage')
  @ApiOperation({ summary: 'Add members (idempotent; audited)' })
  async addMembers(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddSessionMembersDto,
    @CurrentUser('userId') actorId: string,
    @Req() req: Request,
  ) {
    return this.sessionsService.addMembers(id, dto.userIds, this.ctx(req, actorId));
  }

  @Delete(':id/members/:userId')
  @RequirePermissions('sessions.manage')
  @ApiOperation({ summary: 'Remove member (audited)' })
  async removeMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser('userId') actorId: string,
    @Req() req: Request,
  ) {
    return this.sessionsService.removeMember(id, userId, this.ctx(req, actorId));
  }

  @Get(':id/instructors')
  @RequirePermissions('sessions.view')
  @ApiOperation({ summary: 'Session instructors (sessions.view)' })
  async instructors(@Param('id', ParseUUIDPipe) id: string) {
    return { instructors: await this.sessionsService.listInstructors(id) };
  }

  @Post(':id/instructors')
  @RequirePermissions('sessions.manage')
  @ApiOperation({
    summary: 'Add instructors (sessions.manage; DB-resolved permission check on each target — 403 INSTRUCTOR_PERMISSION_MISSING)',
  })
  async addInstructors(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddSessionInstructorsDto,
    @CurrentUser('userId') actorId: string,
    @Req() req: Request,
  ) {
    return this.sessionsService.addInstructors(id, dto.instructorIds, this.ctx(req, actorId));
  }

  @Delete(':id/instructors/:userId')
  @RequirePermissions('sessions.manage')
  @ApiOperation({ summary: 'Remove instructor (audited)' })
  async removeInstructor(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser('userId') actorId: string,
    @Req() req: Request,
  ) {
    return this.sessionsService.removeInstructor(id, userId, this.ctx(req, actorId));
  }

  @Get(':id/milestones')
  @RequirePermissions('sessions.view')
  @ApiOperation({ summary: 'Session milestones (sessions.view; ordered by sortOrder)' })
  async milestones(@Param('id', ParseUUIDPipe) id: string) {
    return { milestones: await this.sessionsService.listMilestones(id) };
  }

  @Post(':id/milestones')
  @RequirePermissions('sessions.manage')
  @ApiOperation({ summary: 'Create milestone (sessions.manage; audited)' })
  async createMilestone(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateMilestoneDto,
    @CurrentUser('userId') actorId: string,
    @Req() req: Request,
  ) {
    return this.sessionsService.createMilestone(id, dto, this.ctx(req, actorId));
  }

  @Patch(':id/milestones/:milestoneId')
  @RequirePermissions('sessions.manage')
  @ApiOperation({ summary: 'Update milestone (sessions.manage; audited)' })
  async updateMilestone(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('milestoneId', ParseUUIDPipe) milestoneId: string,
    @Body() dto: UpdateMilestoneDto,
    @CurrentUser('userId') actorId: string,
    @Req() req: Request,
  ) {
    return this.sessionsService.updateMilestone(id, milestoneId, dto, this.ctx(req, actorId));
  }

  @Delete(':id/milestones/:milestoneId')
  @RequirePermissions('sessions.manage')
  @ApiOperation({ summary: 'Delete milestone (sessions.manage; audited)' })
  async deleteMilestone(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('milestoneId', ParseUUIDPipe) milestoneId: string,
    @CurrentUser('userId') actorId: string,
    @Req() req: Request,
  ) {
    return this.sessionsService.deleteMilestone(id, milestoneId, this.ctx(req, actorId));
  }
}
