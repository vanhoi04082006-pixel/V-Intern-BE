import { Controller, Get, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { clientIp, userAgent } from '../../common/types/request-info';
import { PermissionsService } from '../../rbac/permissions.service';
import { EvaluationAssistanceService } from './evaluation-assistance.service';

/**
 * AI Evaluation Assistance API (Phase 6, spec 26) — instructor workspace
 * ONLY. Interns hold no `ai.evaluation.assist` permission, so the guard
 * rejects them before the service ever runs (spec 27/48).
 *
 * SWAGGER CONTRACT (spec 70): all responses are AI-GENERATED, ADVISORY and
 * NON-AUTHORITATIVE. Suggestions never change evaluation scores; the
 * Instructor applies values explicitly via the normal evaluation API.
 * There is deliberately NO AI "apply" endpoint (spec 26 — authority stays
 * with the deterministic Phase-5 flow).
 */
@ApiTags('evaluation-ai-assistance')
@ApiBearerAuth()
@Controller('evaluations')
export class EvaluationAssistanceController {
  constructor(
    private readonly assistanceService: EvaluationAssistanceService,
    private readonly permissionsService: PermissionsService,
  ) {}

  private ctx(req: Request, actorId: string) {
    return { actorId, ip: clientIp(req), userAgent: userAgent(req) };
  }

  @Post(':id/ai-suggestions')
  @RequirePermissions('ai.evaluation.assist')
  @Throttle({
    default: {
      limit: Number(process.env.THROTTLE_AI_EVALUATION_ASSIST_PER_MIN ?? 4),
      ttl: 60_000,
    },
  })
  @ApiOperation({
    summary:
      'Generate an AI draft suggestion for an evaluation (ai.evaluation.assist; evaluator-of-record or admin; DRAFT ONLY — advisory, non-authoritative, never applied automatically; regenerations append history)',
  })
  async generate(
    @CurrentUser('userId') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const isAdmin = await this.permissionsService.hasRole(userId, 'admin');
    return this.assistanceService.generate({ userId, isAdmin }, id, this.ctx(req, userId));
  }

  @Get(':id/ai-suggestions')
  @RequirePermissions('ai.evaluation.assist')
  @ApiOperation({
    summary: 'List AI suggestion history for an evaluation (ai.evaluation.assist; ownership enforced)',
  })
  async list(@CurrentUser('userId') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    const isAdmin = await this.permissionsService.hasRole(userId, 'admin');
    return this.assistanceService.listSuggestions({ userId, isAdmin }, id);
  }

  @Get(':id/ai-suggestions/:suggestionId')
  @RequirePermissions('ai.evaluation.assist')
  @ApiOperation({
    summary: 'One AI suggestion (ai.evaluation.assist; ownership enforced; 404-safe for foreign rows)',
  })
  async getOne(
    @CurrentUser('userId') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('suggestionId', ParseUUIDPipe) suggestionId: string,
  ) {
    const isAdmin = await this.permissionsService.hasRole(userId, 'admin');
    return this.assistanceService.getSuggestion({ userId, isAdmin }, id, suggestionId);
  }
}
