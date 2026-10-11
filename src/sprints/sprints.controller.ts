import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { toPaginated } from '../common/pagination/paginated';
import { clientIp, userAgent } from '../common/types/request-info';
import { ActorContext } from '../users/users.service';
import { SprintsService } from './sprints.service';
import { PermissionsService } from '../rbac/permissions.service';
import { resolveOwnership } from '../rbac/ownership';
import {
  CreateSprintDto,
  QuerySprintsDto,
  TransitionSprintDto,
  UpdateSprintDto,
} from './dto/sprint.dtos';

@ApiTags('sprints')
@ApiBearerAuth()
@Controller('sprints')
export class SprintsController {
  constructor(
    private readonly sprintsService: SprintsService,
    private readonly permissionsService: PermissionsService,
  ) {}

  private ctx(req: Request, actorId: string): ActorContext {
    return { actorId, ip: clientIp(req), userAgent: userAgent(req) };
  }

  private ownership(userId: string) {
    return resolveOwnership(this.permissionsService, userId);
  }

  @Get()
  @RequirePermissions('sprints.view')
  @ApiOperation({ summary: 'Paginated sprints (sprints.view; filters: projectId, sessionId, status; managed scope only)' })
  async list(@Query() query: QuerySprintsDto, @CurrentUser('userId') userId: string) {
    const { items, total } = await this.sprintsService.list({
      page: query.page,
      pageSize: query.pageSize,
      projectId: query.projectId,
      sessionId: query.sessionId,
      status: query.status,
    }, await this.ownership(userId));
    return toPaginated(items, query.page, query.pageSize, total);
  }

  @Post()
  @RequirePermissions('sprints.manage')
  @ApiOperation({
    summary:
      'Create sprint (sprints.manage; planned status; ONE tx with audit; 409 PROJECT_NOT_ASSIGNABLE / SPRINT_CODE_TAKEN / 404 PROJECT_NOT_FOUND / SESSION_NOT_FOUND)',
  })
  async create(
    @Body() dto: CreateSprintDto,
    @CurrentUser('userId') actorId: string,
    @Req() req: Request,
  ) {
    return this.sprintsService.create(dto, this.ctx(req, actorId));
  }

  @Get(':id')
  @RequirePermissions('sprints.view')
  @ApiOperation({ summary: 'Sprint detail (sprints.view; includes project/session summaries; managed scope only)' })
  async getOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('userId') userId: string) {
    return this.sprintsService.getOneDetailed(id, await this.ownership(userId));
  }

  @Patch(':id')
  @RequirePermissions('sprints.manage')
  @ApiOperation({
    summary:
      'Update sprint metadata (sprints.manage; name/description/goal/dates; terminal sprints frozen → 409 INVALID_SPRINT_TRANSITION; 400 INVALID_SPRINT_DATES)',
  })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSprintDto,
    @CurrentUser('userId') actorId: string,
    @Req() req: Request,
  ) {
    return this.sprintsService.update(id, dto, this.ctx(req, actorId));
  }

  @Post(':id/status')
  @RequirePermissions('sprints.manage')
  @ApiOperation({
    summary:
      'Sprint status transition (sprints.manage; legal: planned→active|cancelled, active→completed|cancelled; 409 INVALID_SPRINT_TRANSITION / SPRINT_ACTIVE_EXISTS / SPRINT_HAS_OPEN_TASKS unless allowOpenTasks=true; activation notifies project interns)',
  })
  async transition(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransitionSprintDto,
    @CurrentUser('userId') actorId: string,
    @Req() req: Request,
  ) {
    return this.sprintsService.transition(id, dto.status, { allowOpenTasks: dto.allowOpenTasks }, this.ctx(req, actorId));
  }

  @Get(':id/board')
  @RequirePermissions('sprints.view')
  @ApiOperation({
    summary:
      'Sprint board — REAL grouping by actual task status (sprints.view; columns carry true counts, never hardcoded; ordered priority→dueDate→createdAt)',
  })
  async board(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('status') status: string | undefined,
    @Query('page') page: string | undefined,
    @Query('pageSize') pageSize: string | undefined,
    @CurrentUser('userId') userId: string,
  ) {
    return this.sprintsService.board(id, {
      page: Math.max(1, Number(page ?? '1') || 1),
      pageSize: Math.min(100, Math.max(1, Number(pageSize ?? '100') || 100)),
      status: status && ['todo', 'doing', 'review', 'done'].includes(status) ? status : undefined,
    }, undefined, await this.ownership(userId));
  }

  @Get(':id/completion')
  @RequirePermissions('sprints.view')
  @ApiOperation({
    summary:
      'Sprint completion summary (sprints.view; total/done/open tasks + committed/completed story points aggregated from the DB; NULL when no task declares points)',
  })
  async completion(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('userId') userId: string) {
    return this.sprintsService.completion(id, await this.ownership(userId));
  }
}
