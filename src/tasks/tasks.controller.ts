import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { toPaginated } from '../common/pagination/paginated';
import { clientIp, userAgent } from '../common/types/request-info';
import { RequestPrincipal } from '../common/types/request-principal';
import { ActorContext } from '../users/users.service';
import { TasksService } from './tasks.service';
import {
  CreateTaskCommentDto,
  CreateTaskDto,
  QueryTasksDto,
  UpdateMyTaskDto,
  UpdateTaskDto,
} from './dto/task.dtos';

/**
 * Task APIs (spec 20/21/33). Manage routes carry explicit permission
 * decorators; ambiguous-access routes (list/detail/comments/history) are
 * authenticated globally and enforce the assignee-OR-manage rule INSIDE
 * the service with DB-resolved effective permissions.
 */
@ApiTags('tasks')
@ApiBearerAuth()
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  private ctx(req: Request, actorId: string): ActorContext {
    return { actorId, ip: clientIp(req), userAgent: userAgent(req) };
  }

  @Get()
  @ApiOperation({
    summary:
      'Paginated tasks (broad callers: filters search/projectId/sprintId/assigneeId/status/priority/due range + sort whitelist; everyone else is ALWAYS scoped to own tasks; mine=true → self)',
  })
  async list(@Query() query: QueryTasksDto, @CurrentUser() principal: RequestPrincipal) {
    const { items, total } = await this.tasksService.list(
      {
        page: query.page,
        pageSize: query.pageSize,
        search: query.search,
        projectId: query.projectId,
        sprintId: query.sprintId,
        assigneeId: query.assigneeId,
        status: query.status,
        priority: query.priority,
        dueFrom: query.dueFrom,
        dueTo: query.dueTo,
        mine: query.mine,
        sortBy: query.sortBy,
        sortOrder: query.sortOrder,
      },
      principal,
    );
    return toPaginated(items, query.page, query.pageSize, total);
  }

  @Post()
  @RequirePermissions('tasks.manage')
  @ApiOperation({
    summary:
      'Create task (tasks.manage; ONE tx: project lock+active check, sprint/project match, assignee active-assignment check, SEQUENCE code, history seed, notification+activity+audit; 409 PROJECT_NOT_ASSIGNABLE / SPRINT_PROJECT_MISMATCH / INVALID_ASSIGNEE / TASK_CODE_CONFLICT)',
  })
  async create(
    @Body() dto: CreateTaskDto,
    @CurrentUser('userId') actorId: string,
    @Req() req: Request,
  ) {
    return this.tasksService.create(dto, this.ctx(req, actorId));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Task detail (assignee OR tasks.view/tasks.manage; 403 TASK_ACCESS_DENIED otherwise)' })
  async getOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() principal: RequestPrincipal) {
    return this.tasksService.getOneDetailed(id, principal);
  }

  @Patch(':id')
  @RequirePermissions('tasks.manage')
  @ApiOperation({
    summary:
      'Update task (tasks.manage; metadata + sprint move + assignee change + optional status transition incl. rework review→doing; history + notifications + audit in ONE tx; 409 SPRINT_PROJECT_MISMATCH / INVALID_ASSIGNEE / INVALID_TASK_TRANSITION / TASK_VERSION_CONFLICT)',
  })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTaskDto,
    @CurrentUser('userId') actorId: string,
    @Req() req: Request,
  ) {
    return this.tasksService.update(id, dto, this.ctx(req, actorId));
  }

  /** Declared BEFORE any other :id sub-action that could shadow it. */
  @Patch(':id/my')
  @RequirePermissions('tasks.update.own')
  @ApiOperation({
    summary:
      'Intern updates OWN task (tasks.update.own; identity = authenticated principal; ONLY status todo→doing / doing→review + progress; 403 TASK_NOT_OWNED / ASSIGNMENT_NOT_ACTIVE; 409 INVALID_TASK_TRANSITION)',
  })
  async updateOwn(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMyTaskDto,
    @CurrentUser() principal: RequestPrincipal,
    @Req() req: Request,
  ) {
    return this.tasksService.updateOwn(id, dto, principal, this.ctx(req, principal.userId));
  }

  @Delete(':id')
  @RequirePermissions('tasks.manage')
  @ApiOperation({
    summary: 'Soft-delete task (tasks.manage; deletedAt set, history preserved, audited)',
  })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('userId') actorId: string,
    @Req() req: Request,
  ) {
    await this.tasksService.softDelete(id, this.ctx(req, actorId));
    return { deleted: true as const };
  }

  @Get(':id/comments')
  @ApiOperation({ summary: 'Task comments (paginated, oldest first; assignee OR tasks.view/tasks.manage)' })
  async listComments(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: QueryTasksDto,
    @CurrentUser() principal: RequestPrincipal,
  ) {
    const { items, total } = await this.tasksService.listComments(
      id,
      { page: query.page, pageSize: query.pageSize },
      principal,
    );
    return toPaginated(items, query.page, query.pageSize, total);
  }

  @Post(':id/comments')
  @ApiOperation({
    summary:
      'Add task comment (assignee OR tasks.manage holders; content 1..2000; comments on inaccessible tasks rejected 403 TASK_ACCESS_DENIED)',
  })
  async addComment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateTaskCommentDto,
    @CurrentUser() principal: RequestPrincipal,
  ) {
    return this.tasksService.addComment(id, dto.content, principal);
  }

  @Get(':id/history')
  @ApiOperation({
    summary: 'Task status history (append-only, oldest first; assignee OR tasks.view/tasks.manage)',
  })
  async listHistory(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: QueryTasksDto,
    @CurrentUser() principal: RequestPrincipal,
  ) {
    const { items, total } = await this.tasksService.listHistory(
      id,
      { page: query.page, pageSize: query.pageSize },
      principal,
    );
    return toPaginated(items, query.page, query.pageSize, total);
  }
}
