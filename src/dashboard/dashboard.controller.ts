import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { AcademicSummaryQueryDto, AcademicOverviewQueryDto, SummaryIdsQueryDto } from './academic-query.dto';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
@ApiTags('dashboard')
@ApiBearerAuth()
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  @Get('catalogs')
  @RequirePermissions('catalogs.read')
  catalogs() { return this.service.catalogs(); }

  @Get('access')
  @RequirePermissions('roles.read','permissions.read','groups.read')
  access() { return this.service.access(); }

  @Get('user-roles')
  @RequirePermissions('users.read','roles.read')
  userRoles(@Query() query:SummaryIdsQueryDto) { return this.service.userRoles(query.ids); }

  @Get('academic')
  @RequirePermissions('classes.view', 'sessions.view', 'projects.view')
  academic(@Query() query: AcademicSummaryQueryDto) { return this.service.academic(query.kind, query.ids); }

  @Get('academic-overview')
  @RequirePermissions('classes.view', 'sessions.view', 'projects.view')
  academicOverview(@Query() query: AcademicOverviewQueryDto) { return this.service.academicOverview(query.kind); }

  @Get('sprints/:id/burndown')
  @RequirePermissions('tasks.view','sprints.view')
  burndown(@Param('id',ParseUUIDPipe) id:string) { return this.service.burndown(id); }

  @Get('admin')
  @RequirePermissions('users.read', 'roles.read', 'audit.read')
  admin() { return this.service.admin(); }

  @Get('instructor')
  @RequirePermissions('sessions.view', 'tasks.view', 'evaluations.view')
  instructor(@CurrentUser('userId') actorId: string) {
    return this.service.instructor(actorId);
  }
}
