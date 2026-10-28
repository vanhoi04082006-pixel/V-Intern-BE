import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { InternService } from './intern.service';
import { InternReadService } from './intern-read.service';
import { PaginationQueryDto } from '../common/pagination/pagination-query.dto';
import { toPaginated } from '../common/pagination/paginated';

@ApiTags('intern')
@ApiBearerAuth()
@Controller('intern')
export class InternController {
  constructor(private readonly internService: InternService, private readonly internReadService: InternReadService) {}

  @Get('me/project')
  @RequirePermissions('intern.workspace.view')
  @ApiOperation({ summary: 'My active assignment project details and technologies; principal identity only; recruitment gate; 404 when unassigned. No broad projects.view permission required.' })
  project(@CurrentUser('userId') userId: string) { return this.internReadService.project(userId); }

  @Get('me/sprint/board')
  @RequirePermissions('intern.workspace.view')
  @ApiOperation({ summary: 'My current sprint board with ONLY my tasks and true per-column counts; principal/assignment scoped, paginated per column; 404 when no active assignment/sprint.' })
  sprintBoard(@CurrentUser('userId') userId: string, @Query() query: PaginationQueryDto) { return this.internReadService.sprintBoard(userId, query); }

  @Get('me/sprints')
  @RequirePermissions('intern.workspace.view')
  @ApiOperation({ summary: 'Planned, active and historical sprints in my active assignment; authenticated principal only.' })
  async sprints(@CurrentUser('userId') userId: string, @Query() query: PaginationQueryDto) {
    const { items, total } = await this.internReadService.sprints(userId, query);
    return toPaginated(items, query.page, query.pageSize, total);
  }

  @Get('me/sprints/:id/board')
  @RequirePermissions('intern.workspace.view')
  @ApiOperation({ summary: 'Selected assignment sprint board with only my tasks, including planned sprints; never activates a sprint.' })
  selectedSprintBoard(@CurrentUser('userId') userId: string, @Param('id', ParseUUIDPipe) id: string, @Query() query: PaginationQueryDto) {
    return this.internReadService.selectedSprintBoard(userId, id, query);
  }

  @Get('me/workspace')
  @RequirePermissions('intern.workspace.view')
  @ApiOperation({
    summary:
      'Current-intern workspace — identity = authenticated principal (never a FE-supplied userId); status driven by DB assignment state; Phase 3 adds REAL sprint/task data: currentSprint, taskSummary, focusedTask (null/zero when unassigned)',
  })
  async workspace(@CurrentUser('userId') userId: string) {
    return this.internService.workspace(userId);
  }
}
