import { GithubRepositoriesService } from '../github/github-repositories.service';
import { Body, Controller, Delete, Get, Logger, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { toPaginated } from '../common/pagination/paginated';
import { clientIp, userAgent } from '../common/types/request-info';
import { ActorContext } from '../users/users.service';
import { AiGenerationService } from '../ai-generation/ai-generation.service';
import {
  AddSessionInstructorsDto,
  AddSessionMembersDto,
  CreateMilestoneDto,
  CreateSessionDto,
  QuerySessionsDto,
  QuerySessionOverviewDto,
  UpdateMilestoneDto,
  UpdateSessionDto,
  QueryInstructorOptionsDto,
  QueryMemberOptionsDto,
} from './dto/session.dtos';
import { SessionsService } from './sessions.service';
import { PermissionsService } from '../rbac/permissions.service';
import { resolveOwnership } from '../rbac/ownership';

@ApiTags('sessions')
@ApiBearerAuth()
@Controller('sessions')
export class SessionsController {
  constructor(
    private readonly sessionsService: SessionsService,
    private readonly permissionsService: PermissionsService,
    private readonly generations: AiGenerationService,
    private readonly repositories: GithubRepositoriesService,
  ) {}

  private readonly logger = new Logger(SessionsController.name);

  private ctx(req: Request, actorId: string): ActorContext {
    return { actorId, ip: clientIp(req), userAgent: userAgent(req) };
  }

  private ownership(userId: string) {
    return resolveOwnership(this.permissionsService, userId);
  }

  @Get()
  @RequirePermissions('sessions.view')
  @ApiOperation({ summary: 'Paginated sessions (sessions.view; filters: q, status; scoped to managed sessions)' })
  async list(@Query() query: QuerySessionsDto, @CurrentUser('userId') userId: string) {
    const { items, total } = await this.sessionsService.list({
      page: query.page,
      pageSize: query.pageSize,
      q: query.q,
      status: query.status,
      projectId: query.projectId,
      leadInstructorId: query.leadInstructorId,
    }, await this.ownership(userId));
    return toPaginated(items, query.page, query.pageSize, total);
  }

  @Get('overview')
  @RequirePermissions('sessions.view')
  @ApiOperation({
    summary:
      'Session management overview (sessions.view; bounded aggregate queries; scoped; no N+1)',
  })
  async overview(@Query() query: QuerySessionOverviewDto, @CurrentUser('userId') userId: string) {
    const { items, total } = await this.sessionsService.listOverview({
      page: query.page,
      pageSize: query.pageSize,
      q: query.q,
      status: query.status,
      projectId: query.projectId,
      leadInstructorId: query.leadInstructorId,
      sortBy: query.sortBy,
      sortDirection: query.sortDirection,
    }, await this.ownership(userId));
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

  @Get('instructor-options')
  @RequirePermissions('sessions.manage')
  @ApiOperation({ summary: 'Search/paginate qualified active instructors; public identity fields only, effective sessions.manage grants including groups' })
  async instructorOptions(@Query() query: QueryInstructorOptionsDto) {
    const { items, total } = await this.sessionsService.instructorOptions(query);
    return toPaginated(items, query.page, query.pageSize, total);
  }

  @Get('member-options')
  @RequirePermissions('sessions.view')
  async memberOptions(@Query() query: QueryMemberOptionsDto, @CurrentUser('userId') userId: string) {
    const { items, total } = await this.sessionsService.memberOptions(query, await this.ownership(userId));
    return toPaginated(items, query.page, query.pageSize, total);
  }

  @Get(':id')
  @RequirePermissions('sessions.view')
  @ApiOperation({ summary: 'Session detail (sessions.view; managed scope only)' })
  async getOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('userId') userId: string) {
    return this.sessionsService.detail(id, await this.ownership(userId));
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
    const updated = await this.sessionsService.update(id, dto, this.ctx(req, actorId));
    // M5 Start → auto-trigger AI planning (fire-and-forget: never fails Start;
    // generatePlan skips when a usable plan already exists for the session).
    if (dto.status === 'active' && updated.status === 'active') {
      this.triggerPlanning(updated.id, actorId, req);
      void this.repositories.provision(updated.id, actorId).catch(() => {
        this.logger.warn(`GitHub repository for session ${updated.id} requires connection/configuration or retry.`);
      });
    }
    return updated;
  }

  private triggerPlanning(sessionId: string, actorId: string, req: Request): void {
    void (async () => {
      try {
        const projectId = await this.sessionsService.resolveSessionProject(sessionId);
        if (!projectId) return;
        const session = await this.sessionsService.getOne(sessionId);
        const days = Math.max(
          1,
          Math.round((new Date(session.endDate).getTime() - new Date(session.startDate).getTime()) / 86400000),
        );
        const sprintCount = Math.min(8, Math.max(1, Math.ceil(days / 14)));
        await this.generations.generatePlan(
          { projectId, sessionId, sprintCount },
          { actorId, ip: clientIp(req), userAgent: userAgent(req) },
        );
      } catch (err) {
        this.logger.warn(
          `AI auto-plan trigger failed for session ${sessionId}: ${err instanceof Error ? err.message : err}`,
        );
      }
    })();
  }

  @Get(':id/members')
  @RequirePermissions('sessions.view')
  @ApiOperation({ summary: 'Session members (sessions.view; managed scope only)' })
  async members(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('userId') userId: string) {
    return { members: await this.sessionsService.listMembers(id, await this.ownership(userId)) };
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
  @ApiOperation({ summary: 'Session instructors (sessions.view; managed scope only)' })
  async instructors(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('userId') userId: string) {
    return { instructors: await this.sessionsService.listInstructors(id, await this.ownership(userId)) };
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
  @ApiOperation({ summary: 'Session milestones (sessions.view; ordered by sortOrder; managed scope only)' })
  async milestones(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('userId') userId: string) {
    return { milestones: await this.sessionsService.listMilestones(id, await this.ownership(userId)) };
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
