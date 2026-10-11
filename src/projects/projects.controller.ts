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
import { PermissionsService } from '../rbac/permissions.service';
import { resolveOwnership } from '../rbac/ownership';

@ApiTags('projects')
@ApiBearerAuth()
@Controller('projects')
export class ProjectsController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly permissionsService: PermissionsService,
  ) {}

  private ctx(req: Request, actorId: string): ActorContext {
    return { actorId, ip: clientIp(req), userAgent: userAgent(req) };
  }

  private ownership(userId: string) {
    return resolveOwnership(this.permissionsService, userId);
  }

  @Get()
  @RequirePermissions('projects.view')
  @ApiOperation({
    summary:
      'Paginated projects (projects.view; filters: q, status, difficulty; sort whitelist: createdAt|code|name; scoped to managed + unclaimed library projects)',
  })
  async list(@Query() query: QueryProjectsDto, @CurrentUser('userId') userId: string) {
    const { items, total } = await this.projectsService.list({
      page: query.page,
      pageSize: query.pageSize,
      q: query.q,
      status: query.status,
      difficulty: query.difficulty,
      domainCategory: query.domainCategory,
      technology: query.technology,
      sort: query.sort,
      order: query.order,
    }, await this.ownership(userId));
    return toPaginated(items, query.page, query.pageSize, total);
  }

  @Get('filter-options')
  @RequirePermissions('projects.view')
  filterOptions() { return this.projectsService.filterOptions(); }

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
  @ApiOperation({ summary: 'Project detail incl. technologies (projects.view; managed + unclaimed library scope)' })
  async getOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('userId') userId: string) {
    return this.projectsService.getOneDetailed(id, await this.ownership(userId));
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
  @ApiOperation({ summary: 'Project members (projects.view; membership is assignment-driven; managed scope)' })
  async members(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('userId') userId: string) {
    return { members: await this.projectsService.listMembers(id, await this.ownership(userId)) };
  }

  @Post(':id/claim')
  @RequirePermissions('projects.manage')
  @ApiOperation({ summary: 'Claim an unmentored library project (projects.manage; 409 when already claimed)' })
  async claim(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('userId') actorId: string,
    @Req() req: Request,
  ) {
    return this.projectsService.claim(id, this.ctx(req, actorId));
  }
}
