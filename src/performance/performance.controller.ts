import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { PermissionsService } from '../rbac/permissions.service';
import { PerformanceQuery } from './performance.service';
import { PerformanceService } from './performance.service';

@ApiTags('performance')
@ApiBearerAuth()
@Controller('performance')
export class PerformanceController {
  constructor(
    private readonly performanceService: PerformanceService,
    private readonly permissionsService: PermissionsService,
  ) {}

  @Get('interns')
  @RequirePermissions('performance.view')
  @ApiOperation({
    summary:
      'Deterministic intern performance list (performance.view): real task/story-point/evaluation metrics; instructors see only interns they own (session instructor / project mentor) — spec 61',
  })
  async list(@CurrentUser('userId') userId: string, @Query() query: PerformanceQuery) {
    const isAdmin = await this.permissionsService.hasRole(userId, 'admin');
    return this.performanceService.listInterns({ userId, isAdmin }, query);
  }

  @Get('interns/:userId')
  @RequirePermissions('performance.view')
  @ApiOperation({
    summary:
      'Full deterministic metrics for ONE intern (performance.view): taskCompletionRate, storyPointCompletionRate, onTimeCompletionRate (null when no due-dated completions), overdueOpenTaskCount, averageEvaluationScore (null when none) — 403 for interns you do not own',
  })
  async getOne(@CurrentUser('userId') userId: string, @Param('userId', ParseUUIDPipe) targetUserId: string, @Query() query: PerformanceQuery) {
    const isAdmin = await this.permissionsService.hasRole(userId, 'admin');
    return this.performanceService.getInternMetrics({ userId, isAdmin }, targetUserId, query);
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
  async me(@CurrentUser('userId') userId: string, @Query() query: PerformanceQuery) {
    return this.performanceService.ownMetrics(userId, query);
  }
}
