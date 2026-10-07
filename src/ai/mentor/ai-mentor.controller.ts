import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { clientIp, userAgent } from '../../common/types/request-info';
import { AiMentorService } from './ai-mentor.service';
import {
  CreateAiMentorConversationDto,
  ListConversationsQueryDto,
  SendAiMentorMessageDto,
} from './ai-mentor.dto';

/**
 * AI Mentor API (Phase 6, spec 13) — identity is ALWAYS the authenticated
 * principal (spec 12); there is no acting-userId parameter anywhere.
 * The message route carries the strict per-minute AI throttle (spec 56).
 *
 * SWAGGER CONTRACT (spec 70): every response is AI-GENERATED, ADVISORY and
 * NON-AUTHORITATIVE — the mentor explains authorized facts; it never
 * changes any business state.
 */
@ApiTags('ai-mentor')
@ApiBearerAuth()
@Controller('intern/me/ai-mentor')
export class AiMentorController {
  constructor(private readonly aiMentorService: AiMentorService) {}

  private ctx(req: Request, actorId: string) {
    return { actorId, ip: clientIp(req), userAgent: userAgent(req) };
  }

  @Get('conversations')
  @RequirePermissions('ai.mentor.use')
  @ApiOperation({
    summary:
      'My AI mentor conversations (ai.mentor.use; identity = principal; AI-generated advisory content — non-authoritative)',
  })
  async list(@CurrentUser('userId') userId: string, @Query() query: ListConversationsQueryDto) {
    return this.aiMentorService.listConversations(userId, {
      page: query.page,
      pageSize: query.pageSize,
      status: query.status,
    });
  }

  @Post('conversations')
  @RequirePermissions('ai.mentor.use')
  @ApiOperation({ summary: 'Create an AI mentor conversation owned by the authenticated intern' })
  async create(
    @CurrentUser('userId') userId: string,
    @Body() dto: CreateAiMentorConversationDto,
    @Req() req: Request,
  ) {
    return this.aiMentorService.createConversation(userId, dto.title ?? null, this.ctx(req, userId));
  }

  @Get('conversations/:id')
  @RequirePermissions('ai.mentor.use')
  @ApiOperation({
    summary:
      'One of my AI mentor conversations with ordered messages (404-safe for foreign conversations)',
  })
  async getOne(@CurrentUser('userId') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.aiMentorService.getConversation(userId, id);
  }

  @Post('conversations/:id/messages')
  @RequirePermissions('ai.mentor.use')
  @Throttle({
    default: {
      limit: Number(process.env.THROTTLE_AI_MENTOR_PER_MIN ?? 10),
      ttl: 60_000,
    },
  })
  @ApiOperation({
    summary:
      'Send a message to MY conversation — persists the user message, builds authorized workspace facts, generates the AI answer (AI-generated, advisory, non-authoritative; provider failure keeps the user message and returns a stable AI_* error)',
  })
  async sendMessage(
    @CurrentUser('userId') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendAiMentorMessageDto,
    @Req() req: Request,
  ) {
    return this.aiMentorService.sendMessage(userId, id, dto.content, this.ctx(req, userId));
  }

  @Post('conversations/:id/archive')
  @RequirePermissions('ai.mentor.use')
  @ApiOperation({
    summary:
      'Archive my conversation (logical status — rows are retained; archived conversations reject new messages; idempotent)',
  })
  async archive(
    @CurrentUser('userId') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    return this.aiMentorService.archiveConversation(userId, id, this.ctx(req, userId));
  }
}
