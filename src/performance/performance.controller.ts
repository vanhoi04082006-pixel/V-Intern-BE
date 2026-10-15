import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { PermissionsService } from '../rbac/permissions.service';
import { PerformanceDirectoryQueryDto, PerformanceQueryDto } from './performance-query.dto';
import { PerformanceService } from './performance.service';
import { PerformanceDirectoryService } from './performance-directory.service';
import { StudentDetailService } from './student-detail.service';

@ApiTags('performance')
@ApiBearerAuth()
@Controller('performance')
export class PerformanceController {
  constructor(
    private readonly performanceService: PerformanceService,
    private readonly permissionsService: PermissionsService,
    private readonly directory: PerformanceDirectoryService,
    private readonly detail: StudentDetailService,
  ) {}

  @Get('interns')
  @RequirePermissions('performance.view')
  @ApiOperation({
    summary:
      'Deterministic intern performance list (performance.view): real task/story-point/evaluation metrics; instructors see only interns they own (session instructor / project mentor) — spec 61',
  })
  async list(@CurrentUser('userId') userId: string, @Query() query: PerformanceDirectoryQueryDto) {
    const isAdmin = await this.permissionsService.hasRole(userId, 'admin');
    return this.directory.list({ userId, isAdmin }, query);
  }

  @Get('interns/:userId')
  @RequirePermissions('performance.view')
  @ApiOperation({
    summary:
      'Full deterministic metrics for ONE intern (performance.view): taskCompletionRate, storyPointCompletionRate, onTimeCompletionRate (null when no due-dated completions), overdueOpenTaskCount, averageEvaluationScore (null when none) — 403 for interns you do not own',
  })
  async getOne(@CurrentUser('userId') userId: string, @Param('userId', ParseUUIDPipe) targetUserId: string, @Query() query: PerformanceQueryDto) {
    const isAdmin = await this.permissionsService.hasRole(userId, 'admin');
    return this.performanceService.getInternMetrics({ userId, isAdmin }, targetUserId, query);
  }
  @Get('interns/:userId/detail')
  @RequirePermissions('performance.view')
  async studentDetail(@CurrentUser('userId') userId: string, @Param('userId', ParseUUIDPipe) targetUserId: string, @Query() query: PerformanceDirectoryQueryDto) {
    return this.detail.get({ userId, isAdmin: await this.permissionsService.hasRole(userId, 'admin') }, targetUserId, query);
  }
}

@ApiTags('intern')
@ApiBearerAuth()
@Controller('intern/me/performance')
export class PerformanceInternController {
  constructor(private readonly performanceService: PerformanceService) {}

  @Get()
  @RequirePermissions('performance.view.own')
  @ApiOperation({
    summary:
      'My deterministic performance metrics (identity = principal): real derived values only — never fake charts; null = not measured (not 0)',
  })
  async me(@CurrentUser('userId') userId: string, @Query() query: PerformanceQueryDto) {
    return this.performanceService.ownMetrics(userId, query);
  }
}
