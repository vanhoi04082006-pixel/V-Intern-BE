import { Body, Controller, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { clientIp, userAgent } from '../common/types/request-info';
import { ActorContext } from '../users/users.service';
import { AiGenerationService } from './ai-generation.service';
import { ConfirmSprintPlanDto, DraftSprintPlanDto } from './dto/ai-generation.dtos';

@ApiTags('ai-generations')
@ApiBearerAuth()
@Controller('ai-generations')
export class AiGenerationController {
  constructor(private readonly generations: AiGenerationService) {}

  private ctx(req: Request, actorId: string): ActorContext {
    return { actorId, ip: clientIp(req), userAgent: userAgent(req) };
  }

  @Post('sprint-plan/draft')
  @RequirePermissions('sprints.manage')
  @ApiOperation({
    summary:
      'Generate a sprint/task draft with AI (sprints.manage; managed project+session only; persists nothing)',
  })
  async draft(
    @Body() dto: DraftSprintPlanDto,
    @CurrentUser('userId') actorId: string,
    @Req() req: Request,
  ) {
    return this.generations.draft(dto, this.ctx(req, actorId));
  }

  @Post('sprint-plan/confirm')
  @RequirePermissions('sprints.manage')
  @ApiOperation({
    summary:
      'Confirm an instructor-reviewed draft (sprints.manage; re-validated server-side; idempotent per requestId)',
  })
  async confirm(
    @Body() dto: ConfirmSprintPlanDto,
    @CurrentUser('userId') actorId: string,
    @Req() req: Request,
  ) {
    return this.generations.confirm(dto, this.ctx(req, actorId));
  }
}
