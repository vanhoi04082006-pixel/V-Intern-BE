import {
  Body,
  Controller,
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
import { CreateProjectDto, QueryProjectsDto, UpdateProjectDto } from './dto/project.dtos';
import { ProjectsService } from './projects.service';

@ApiTags('projects')
@ApiBearerAuth()
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  private ctx(req: Request, actorId: string): ActorContext {
    return { actorId, ip: clientIp(req), userAgent: userAgent(req) };
  }

  @Get()
  @RequirePermissions('projects.view')
  @ApiOperation({
    summary:
      'Paginated projects (projects.view; filters: q, status, difficulty; sort whitelist: createdAt|code|name)',
  })
  async list(@Query() query: QueryProjectsDto) {
    const { items, total } = await this.projectsService.list({
      page: query.page,
      pageSize: query.pageSize,
      q: query.q,
      status: query.status,
      difficulty: query.difficulty,
      sort: query.sort,
      order: query.order,
    });
    return toPaginated(items, query.page, query.pageSize, total);
  }

  @Post()
  @RequirePermissions('projects.manage')
  @ApiOperation({ summary: 'Create project (projects.manage; audited; technologies relational)' })
  async create(
    @Body() dto: CreateProjectDto,
    @CurrentUser('userId') actorId: string,
    @Req() req: Request,
  ) {
    return this.projectsService.create(dto, this.ctx(req, actorId));
  }

  @Get(':id')
  @RequirePermissions('projects.view')
  @ApiOperation({ summary: 'Project detail incl. technologies (projects.view)' })
  async getOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.projectsService.getOneDetailed(id);
  }

  @Patch(':id')
  @RequirePermissions('projects.manage')
  @ApiOperation({
    summary:
      'Update project (projects.manage; archived is terminal → 409 PROJECT_ARCHIVED; technologies REPLACE strategy)',
  })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProjectDto,
    @CurrentUser('userId') actorId: string,
    @Req() req: Request,
  ) {
    return this.projectsService.update(id, dto, this.ctx(req, actorId));
  }

  @Get(':id/members')
  @RequirePermissions('projects.view')
  @ApiOperation({ summary: 'Project members (projects.view; membership is assignment-driven)' })
  async members(@Param('id', ParseUUIDPipe) id: string) {
    return { members: await this.projectsService.listMembers(id) };
  }
}
