import { Controller, Get, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { clientIp, userAgent } from '../../common/types/request-info';
import { PermissionsService } from '../../rbac/permissions.service';
import { RecommendationsService } from './recommendations.service';

/**
 * AI Recommendations API (Phase 6, spec 33). The intern reads/refreshes
 * OWN recommendations; the instructor reads within their OWN authorized
 * scope (session instructor / project mentor). The refresh route carries
 * the strict AI throttle AND the source-hash reuse rule (spec 35), so a
 * refresh with unchanged facts never calls the provider at all.
 *
 * SWAGGER CONTRACT (spec 70): recommendations are AI-GENERATED, ADVISORY
 * and NON-AUTHORITATIVE — they explain deterministic DB metrics; they
 * never change any business state.
 */
@ApiTags('ai-recommendations')
@ApiBearerAuth()
@Controller()
export class RecommendationsController {
  constructor(
    private readonly recommendationsService: RecommendationsService,
    private readonly permissionsService: PermissionsService,
  ) {}

  private ctx(req: Request, actorId: string) {
    return { actorId, ip: clientIp(req), userAgent: userAgent(req) };
  }

  @Get('intern/me/ai-recommendations')
  @RequirePermissions('ai.recommendations.view.own')
  @ApiOperation({
    summary:
      'My latest AI development recommendations (ai.recommendations.view.own; AI-generated, advisory, non-authoritative; 404 until first refresh)',
  })
  async latestOwn(@CurrentUser('userId') userId: string) {
    return this.recommendationsService.latestOwn(userId);
  }

  @Post('intern/me/ai-recommendations/refresh')
  @RequirePermissions('ai.recommendations.view.own')
  @Throttle({
    default: {
      limit: Number(process.env.THROTTLE_AI_RECOMMENDATION_PER_MIN ?? 4),
      ttl: 60_000,
    },
  })
  @ApiOperation({
    summary:
      'Refresh my recommendations — deterministic source facts are hashed; unchanged facts reuse the existing snapshot WITHOUT a provider call; changed facts generate a new snapshot (AI-generated, advisory)',
  })
  async refreshOwn(@CurrentUser('userId') userId: string, @Req() req: Request) {
    return this.recommendationsService.refresh(
      { userId, isAdmin: false },
      userId,
      this.ctx(req, userId),
    );
  }

  @Get('performance/interns/:userId/ai-recommendations')
  @RequirePermissions('ai.recommendations.view')
  @ApiOperation({
    summary:
      'Latest AI recommendations for one intern (ai.recommendations.view; strict session/project mentor scope or admin; advisory, non-authoritative)',
  })
  async latestForIntern(
    @CurrentUser('userId') userId: string,
    @Param('userId', ParseUUIDPipe) targetUserId: string,
  ) {
    const isAdmin = await this.permissionsService.hasRole(userId, 'admin');
    return this.recommendationsService.latestForInstructor({ userId, isAdmin }, targetUserId);
  }
}
