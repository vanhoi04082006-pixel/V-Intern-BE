import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
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
import { AssignmentsService } from './assignments.service';
import { PermissionsService } from '../rbac/permissions.service';
import { resolveOwnership } from '../rbac/ownership';
import { CreateAssignmentDto, QueryAssignmentsDto } from './dto/assignment.dtos';

@ApiTags('assignments')
@ApiBearerAuth()
@Controller('assignments')
export class AssignmentsController {
  constructor(
    private readonly assignmentsService: AssignmentsService,
    private readonly permissionsService: PermissionsService,
  ) {}

  private ctx(req: Request, actorId: string): ActorContext {
    return { actorId, ip: clientIp(req), userAgent: userAgent(req) };
  }

  private ownership(userId: string) {
    return resolveOwnership(this.permissionsService, userId);
  }

  @Get()
  @RequirePermissions('assignments.view')
  @ApiOperation({
    summary: 'Paginated assignments (assignments.view; filters: internId, sessionId, projectId, status; own or managed-session scope)',
  })
  async list(@Query() query: QueryAssignmentsDto, @CurrentUser('userId') userId: string) {
    const { items, total } = await this.assignmentsService.list({
      page: query.page,
      pageSize: query.pageSize,
      internId: query.internId,
      sessionId: query.sessionId,
      projectId: query.projectId,
      status: query.status,
    }, await this.ownership(userId));
    return toPaginated(items, query.page, query.pageSize, total);
  }

  @Post()
  @RequirePermissions('assignments.manage')
  @ApiOperation({
    summary:
      'Create assignment — ONE transaction: intern lock, session/project validation, capacity, conflict check, membership ensure, notification+audit+activity (409 ASSIGNMENT_CONFLICT / PROJECT_CAPACITY_FULL / SESSION_NOT_ASSIGNABLE / PROJECT_NOT_ASSIGNABLE)',
  })
  async create(
    @Body() dto: CreateAssignmentDto,
    @CurrentUser('userId') actorId: string,
    @Req() req: Request,
  ) {
    return this.assignmentsService.create(dto, this.ctx(req, actorId));
  }

  @Get(':id')
  @RequirePermissions('assignments.view')
  @ApiOperation({ summary: 'Assignment detail (assignments.view; includes project/session/intern summaries; own or managed-session scope)' })
  async getOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('userId') userId: string) {
    return this.assignmentsService.getOneDetailed(id, await this.ownership(userId));
  }

  @Post(':id/complete')
  @RequirePermissions('assignments.manage')
  @ApiOperation({
    summary: 'Complete an active assignment (assignments.manage; audited; intern notified; history preserved)',
  })
  async complete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('userId') actorId: string,
    @Req() req: Request,
  ) {
    return this.assignmentsService.complete(id, this.ctx(req, actorId));
  }

  @Post(':id/cancel')
  @RequirePermissions('assignments.manage')
  @ApiOperation({
    summary: 'Cancel an active assignment (assignments.manage; session roster row removed; audited; intern notified)',
  })
  async cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('userId') actorId: string,
    @Req() req: Request,
  ) {
    return this.assignmentsService.cancel(id, this.ctx(req, actorId));
  }
}
