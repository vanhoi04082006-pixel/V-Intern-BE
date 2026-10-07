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
import { CreateAssignmentDto, QueryAssignmentsDto } from './dto/assignment.dtos';

@ApiTags('assignments')
@ApiBearerAuth()
@Controller('assignments')
export class AssignmentsController {
  constructor(private readonly assignmentsService: AssignmentsService) {}

  private ctx(req: Request, actorId: string): ActorContext {
    return { actorId, ip: clientIp(req), userAgent: userAgent(req) };
  }

  @Get()
  @RequirePermissions('assignments.view')
  @ApiOperation({
    summary: 'Paginated assignments (assignments.view; filters: internId, sessionId, projectId, status)',
  })
  async list(@Query() query: QueryAssignmentsDto) {
    const { items, total } = await this.assignmentsService.list({
      page: query.page,
      pageSize: query.pageSize,
      internId: query.internId,
      sessionId: query.sessionId,
      projectId: query.projectId,
      status: query.status,
    });
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
  @ApiOperation({ summary: 'Assignment detail (assignments.view; includes project/session/intern summaries)' })
  async getOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.assignmentsService.getOneDetailed(id);
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
}
