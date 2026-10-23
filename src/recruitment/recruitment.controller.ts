import { InterviewConversationService } from './interview-conversation.service';
import { InterviewFollowUpService } from './interview-follow-up.service';
import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { clientIp, userAgent } from '../common/types/request-info';
import { InterviewService } from './interview.service';
import {
  RecruitmentRateLimit,
  RecruitmentRateLimitGuard,
} from './recruitment-rate-limit.guard';
import { RecruitmentService } from './recruitment.service';
import { RecruitmentEvaluationService } from './recruitment-evaluation.service';
import { SaveAnswerDto, SelectRoleDto, QueryCandidatesDto } from './dto/recruitment.dto';
import { PaginationQueryDto } from '../common/pagination/pagination-query.dto';

/**
 * Phase 4 recruitment APIs (spec 41-45).
 *
 * SECURITY CONTRACTS:
 * - Identity is ALWAYS the authenticated principal — no endpoint accepts a
 *   userId as authority (spec 43).
 * - There is NO public question-bank endpoint (spec 11): the old prototype
 *   hole GET /recruitment/questions does NOT exist; interns receive ONLY
 *   their own session's sanitized questions (no rubric, spec 42).
 * - Interns cannot set scores/decisions — no such DTO fields exist and the
 *   provider's own decision fields are ignored (spec 5/36).
 */
@ApiTags('recruitment')
@ApiBearerAuth()
@UseGuards(RecruitmentRateLimitGuard)
@Controller('recruitment')
export class RecruitmentController {
  constructor(
    private readonly recruitmentService: RecruitmentService,
    private readonly interviewService: InterviewService,
    private readonly evaluationService: RecruitmentEvaluationService,
    private readonly conversation: InterviewConversationService,
    private readonly followUps: InterviewFollowUpService,
  ) {}

  private ctx(req: Request, actorId: string) {
    return { actorId, ip: clientIp(req), userAgent: userAgent(req) };
  }

  @Get('me')
  @RequirePermissions('recruitment.view.own')
  @ApiOperation({ summary: 'My recruitment profile: status, attempts, cooldown, latest result (spec 41)' })
  async me(@CurrentUser('userId') userId: string) {
    return this.recruitmentService.me(userId);
  }

  @Get('me/interviews')
  @RequirePermissions('recruitment.view.own')
  @ApiOperation({ summary: 'My interview attempts and persisted results, newest attempt first' })
  history(@CurrentUser('userId') userId: string, @Query() query: PaginationQueryDto) {
    return this.interviewService.history(userId, query);
  }

  @Patch('me/role')
  @RequirePermissions('recruitment.start.own')
  @ApiOperation({ summary: 'Select a career code from the published recruiting catalog' })
  async selectRole(
    @CurrentUser('userId') userId: string,
    @Body() dto: SelectRoleDto,
    @Req() req: Request,
  ) {
    return this.recruitmentService.selectRole(userId, dto.role, this.ctx(req, userId));
  }

  @Post('me/interviews')
  @RecruitmentRateLimit('interview-start')
  @RequirePermissions('recruitment.start.own')
  @ApiOperation({
    summary:
      'Start an interview session: 10 sequential questions (2 introduction + 6 technical + 2 English), backend timer, attempt+cooldown enforced',
  })
  async startInterview(@CurrentUser('userId') userId: string, @Req() req: Request) {
    return this.interviewService.start(userId, this.ctx(req, userId));
  }

  @Get('me/interviews/:id')
  @RequirePermissions('recruitment.view.own')
  @ApiOperation({ summary: 'My interview session status (own sessions only; 404-safe)' })
  async getSession(@CurrentUser('userId') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.interviewService.getOwn(userId, id);
  }

  @Get('me/interviews/:id/questions')
  @RequirePermissions('recruitment.answer.own')
  @ApiOperation({
    summary:
      'Sanitized questions of MY session: id/position/category/prompt/answered — NEVER rubric or expected answers (spec 42)',
  })
  async getQuestions(@CurrentUser('userId') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.interviewService.getQuestions(userId, id);
  }

  @Get('me/interviews/:id/conversation')
  @RequirePermissions('recruitment.view.own')
  conversationView(@CurrentUser('userId') userId: string, @Param('id', ParseUUIDPipe) id: string) { return this.conversation.view(userId, id); }

  @Post('me/interviews/:id/conversation/clarify')
  @RecruitmentRateLimit('interview-chat')
  @RequirePermissions('recruitment.answer.own')
  clarifyConversation(@CurrentUser('userId') userId: string, @Param('id', ParseUUIDPipe) id: string) { return this.conversation.clarify(userId, id); }

  @Post('me/interviews/:id/conversation/next')
  @RecruitmentRateLimit('interview-chat')
  @RequirePermissions('recruitment.answer.own')
  nextConversation(@CurrentUser('userId') userId: string, @Param('id', ParseUUIDPipe) id: string) { return this.conversation.next(userId, id); }

  @Put('me/interviews/:id/answers/:questionId')
  @RequirePermissions('recruitment.answer.own')
  @ApiOperation({
    summary:
      'Save/update MY answer for a session question (only while in_progress and before backend expiry — spec 16/17)',
  })
  async saveAnswer(
    @CurrentUser('userId') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('questionId', ParseUUIDPipe) questionId: string,
    @Body() dto: SaveAnswerDto,
  ) {
    return this.interviewService.saveAnswer(userId, id, questionId, dto.answerText);
  }

  @Put('me/interviews/:id/follow-ups/:questionId')
  @RequirePermissions('recruitment.answer.own')
  answerFollowUp(@CurrentUser('userId') userId: string, @Param('id', ParseUUIDPipe) id: string,
    @Param('questionId', ParseUUIDPipe) questionId: string, @Body() dto: SaveAnswerDto) {
    return this.followUps.answer(userId, id, questionId, dto.answerText);
  }

  @Post('me/interviews/:id/submit')
  @HttpCode(200)
  @RecruitmentRateLimit('interview-submit')
  @RequirePermissions('recruitment.submit.own')
  @ApiOperation({
    summary:
      'Submit the interview (idempotent): validates completeness + backend timer, then runs the AI evaluation; Backend computes overall = 0.7*technical + 0.3*soft and the pass/fail decision itself (spec 4/36)',
  })
  async submit(
    @CurrentUser('userId') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    return this.interviewService.submit(
      userId,
      id,
      this.ctx(req, userId),
      (sessionId, ctx) => this.evaluationService.evaluateSession(sessionId, ctx),
    );
  }

  @Post('me/interviews/:id/retry-evaluation')
  @HttpCode(200)
  @RecruitmentRateLimit('evaluation-retry')
  @RequirePermissions('recruitment.submit.own')
  @ApiOperation({
    summary:
      'Retry a failed evaluation (evaluation_failed only): same snapshots, same answers, no duplicate result (spec 39/40)',
  })
  async retryEvaluation(
    @CurrentUser('userId') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    return this.interviewService.retryEvaluation(
      userId,
      id,
      this.ctx(req, userId),
      (sessionId, ctx) => this.evaluationService.evaluateSession(sessionId, ctx),
    );
  }

  @Get('me/result')
  @RequirePermissions('recruitment.view.own')
  @ApiOperation({ summary: 'My authoritative recruitment result (backend-computed scores + decision)' })
  async myResult(@CurrentUser('userId') userId: string) {
    return this.recruitmentService.myResult(userId);
  }

  // ── Management read APIs (spec 44) — recruitment.view required ──────────

  @Get('candidates')
  @RequirePermissions('recruitment.view')
  @ApiOperation({ summary: 'Candidate recruitment status list (instructor/admin read-only)' })
  async candidates(@CurrentUser('userId') actor: string, @Query() query: QueryCandidatesDto) {
    return this.recruitmentService.listCandidates(actor, {
      page: query.page,
      pageSize: query.pageSize,
      search: query.search,
      role: query.role,
      eligibility: query.eligibility,
      status: query.status,
      sort: query.sort,
    });
  }

  @Get('candidates/:userId')
  @RequirePermissions('recruitment.view')
  @ApiOperation({ summary: 'One candidate recruitment status (read-only)' })
  async candidate(@Param('userId', ParseUUIDPipe) userId: string, @CurrentUser('userId') actor: string) {
    return this.recruitmentService.getCandidateProfile(userId, actor);
  }
}
