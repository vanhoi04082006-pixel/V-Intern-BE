import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { InternService } from './intern.service';

@ApiTags('intern')
@ApiBearerAuth()
@Controller('intern')
export class InternController {
  constructor(private readonly internService: InternService) {}

  @Get('me/workspace')
  @RequirePermissions('intern.workspace.view')
  @ApiOperation({
    summary:
      'Current-intern workspace — identity = authenticated principal (never a FE-supplied userId); status driven by DB assignment state: {status:"unassigned", assignment:null} | {status:"active", assignment:{id, project, session, assignedAt}}',
  })
  async workspace(@CurrentUser('userId') userId: string) {
    return this.internService.workspace(userId);
  }
}
