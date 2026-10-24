import { Body, Controller, Get, Param, ParseIntPipe, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { RequestPrincipal } from '../common/types/request-principal';
import { PermissionsService } from '../rbac/permissions.service';
import { resolveOwnership } from '../rbac/ownership';
import { TemplatesService } from './templates.service';
import { TemplateRevisionsStore } from './template-revisions.store';
import { PaginationQueryDto } from '../common/pagination/pagination-query.dto';
import { ChangeRequestDto, CreateTemplateDto, QueryTemplatesDto, StartTemplateDto, UpdateTemplateDto } from './template.dto';
@ApiTags('project templates') @ApiBearerAuth() @Controller()
export class TemplatesController {
  constructor(private readonly service: TemplatesService, private readonly permissions: PermissionsService, private readonly revisions: TemplateRevisionsStore) {}
  @Get('project-templates/:id/revisions') @RequirePermissions('projects.manage')
  history(@Param('id', ParseUUIDPipe) id: string, @Query() query: PaginationQueryDto) { return this.revisions.history(id, query.page, query.pageSize); }
  @Get('project-templates/:id/revisions/:version') @RequirePermissions('projects.manage')
  revision(@Param('id', ParseUUIDPipe) id: string, @Param('version', ParseIntPipe) version: number) { return this.revisions.revision(id, version); }
  @Get('project-templates/:id/revisions/:version/assessment') @RequirePermissions('projects.manage', 'templates.assessment.read')
  revisionAssessment(@Param('id', ParseUUIDPipe) id: string, @Param('version', ParseIntPipe) version: number, @CurrentUser('userId') actor: string) { return this.revisions.assessment(id, actor, version); }
  @Get('project-templates/:id/assessment') @RequirePermissions('projects.manage', 'templates.assessment.read')
  assessment(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('userId') actor: string) { return this.revisions.assessment(id, actor); }
  @Get('projects/:id/template-assessment') @RequirePermissions('projects.manage', 'templates.assessment.read')
  projectAssessment(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('userId') actor: string) { return this.service.projectAssessment(id, actor); }
  @Get('project-templates') @RequirePermissions('projects.manage')
  list(@Query() query: QueryTemplatesDto) { return this.service.list(query); }
  @Post('project-templates') @RequirePermissions('projects.manage')
  create(@Body() dto: CreateTemplateDto,@CurrentUser('userId') actor: string) { return this.service.create(dto,actor); }
  @Get('project-templates/:id') @RequirePermissions('projects.manage')
  async get(@Param('id',ParseUUIDPipe) id: string, @CurrentUser('userId') actor: string) { return this.service.get(id, await resolveOwnership(this.permissions, actor)); }
  @Patch('project-templates/:id') @RequirePermissions('projects.manage')
  update(@Param('id',ParseUUIDPipe) id: string,@Body() dto: UpdateTemplateDto,@CurrentUser('userId') actor: string) { return this.service.update(id,dto,actor); }
  @Post('project-templates/:id/start') @RequirePermissions('projects.manage','sessions.manage','tasks.manage')
  start(@Param('id',ParseUUIDPipe) id: string,@Body() dto: StartTemplateDto,@CurrentUser('userId') actor: string) { return this.service.start(id,dto,actor); }
  @Get('tasks/:id/spec')
  spec(@Param('id',ParseUUIDPipe) id: string,@CurrentUser() principal: RequestPrincipal) { return this.service.taskSpec(id,principal); }
  @Get('tasks/:id/spec/source')
  sourceSpec(@Param('id',ParseUUIDPipe) id: string,@CurrentUser() principal: RequestPrincipal) { return this.service.taskSpec(id,principal,'source'); }
  @Get('projects/:id/template-context') @RequirePermissions('projects.manage')
  context(@Param('id',ParseUUIDPipe) id: string,@CurrentUser('userId') actor: string) { return this.service.projectContext(id,actor); }
  @Get('projects/:id/changes') @RequirePermissions('projects.manage')
  changes(@Param('id',ParseUUIDPipe) id: string,@CurrentUser('userId') actor: string) { return this.service.changes(id,actor); }
  @Post('projects/:id/changes') @RequirePermissions('projects.manage')
  propose(@Param('id',ParseUUIDPipe) id: string,@Body() dto: ChangeRequestDto,@CurrentUser('userId') actor: string) { return this.service.propose(id,dto,actor); }
  @Post('project-changes/:id/apply') @RequirePermissions('projects.manage','tasks.manage')
  apply(@Param('id',ParseUUIDPipe) id: string,@CurrentUser('userId') actor: string) { return this.service.apply(id,actor); }
}
