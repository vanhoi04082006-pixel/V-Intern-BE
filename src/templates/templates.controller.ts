import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { RequestPrincipal } from '../common/types/request-principal';
import { PermissionsService } from '../rbac/permissions.service';
import { resolveOwnership } from '../rbac/ownership';
import { TemplatesService } from './templates.service';
import { ChangeRequestDto, CreateTemplateDto, QueryTemplatesDto, StartTemplateDto, UpdateTemplateDto } from './template.dto';
@ApiTags('project templates') @ApiBearerAuth() @Controller()
export class TemplatesController {
  constructor(private readonly service: TemplatesService, private readonly permissions: PermissionsService) {}
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
