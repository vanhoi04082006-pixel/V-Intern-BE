import { Body, Controller, Delete, ForbiddenException, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { clientIp, userAgent } from '../common/types/request-info';
import { PermissionsService } from '../rbac/permissions.service';
import { EvaluationService } from './evaluation.service';
import {
  ChangeEvaluationCycleStatusDto,
  CreateEvaluationCriterionDto,
  CreateEvaluationCycleDto,
  CreateEvaluationDto,
  ReviseEvaluationDto,
  UpdateEvaluationCriterionDto,
  UpdateEvaluationCycleDto,
  UpdateEvaluationDto,
  QueryEvaluationCyclesDto,
  QueryEvaluationsDto,
} from './dto/evaluation.dtos';

@ApiTags('evaluation-cycles')
@ApiBearerAuth()
@Controller('evaluation-cycles')
export class EvaluationCyclesController {
  constructor(
    private readonly evaluationService: EvaluationService,
    private readonly permissionsService: PermissionsService,
  ) {}

  private ctx(req: Request, actorId: string) {
    return { actorId, ip: clientIp(req), userAgent: userAgent(req) };
  }

  @Get()
  @RequirePermissions('evaluations.view')
  @ApiOperation({ summary: 'List evaluation cycles (evaluations.view; filters: status/sessionId/projectId)' })
  async list(@Query() query: QueryEvaluationCyclesDto, @CurrentUser('userId') userId: string) {
    return this.evaluationService.listCycles({
      page: query.page,
      pageSize: query.pageSize,
      status: query.status,
      sessionId: query.sessionId,
      projectId: query.projectId,
    }, { userId, isAdmin: await this.permissionsService.hasRole(userId, 'admin') });
  }

  @Post()
  @RequirePermissions('evaluations.manage')
  @ApiOperation({
    summary:
      'Create a draft cycle; seeds the documented evaluation-v1 template (35/30/20/15) by default — criteria editable only while draft',
  })
  async create(@Body() dto: CreateEvaluationCycleDto, @CurrentUser('userId') userId: string, @Req() req: Request) {
    return this.evaluationService.createCycle(dto, this.ctx(req, userId), { userId, isAdmin: await this.permissionsService.hasRole(userId, 'admin') });
  }

  @Get(':id')
  @RequirePermissions('evaluations.view')
  @ApiOperation({ summary: 'One evaluation cycle (evaluations.view)' })
  async getOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('userId') userId: string) {
    return this.evaluationService.getCycle(id, { userId, isAdmin: await this.permissionsService.hasRole(userId, 'admin') });
  }

  @Patch(':id')
  @RequirePermissions('evaluations.manage')
  @ApiOperation({ summary: 'Update a DRAFT cycle (name/dates) — open/closed/archived cycles are immutable' })
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateEvaluationCycleDto, @CurrentUser('userId') userId: string, @Req() req: Request) {
    await this.evaluationService.getCycle(id, { userId, isAdmin: await this.permissionsService.hasRole(userId, 'admin') });
    return this.evaluationService.updateCycle(id, dto, this.ctx(req, userId));
  }

  @Post(':id/status')
  @RequirePermissions('evaluations.manage')
  @ApiOperation({
    summary:
      'Explicit cycle state transition (draft→open|archived, open→closed, closed→archived); opening requires active criteria weights to total exactly 100%',
  })
  async changeStatus(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ChangeEvaluationCycleStatusDto, @CurrentUser('userId') userId: string, @Req() req: Request) {
    await this.evaluationService.getCycle(id, { userId, isAdmin: await this.permissionsService.hasRole(userId, 'admin') });
    return this.evaluationService.changeCycleStatus(id, dto.status, this.ctx(req, userId));
  }

  @Get(':id/criteria')
  @RequirePermissions('evaluations.view')
  @ApiOperation({ summary: 'Cycle criteria with weights (evaluations.view)' })
  async criteria(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('userId') userId: string) {
    await this.evaluationService.getCycle(id, { userId, isAdmin: await this.permissionsService.hasRole(userId, 'admin') });
    return { items: await this.evaluationService.listCriteria(id) };
  }

  @Post(':id/criteria')
  @RequirePermissions('evaluations.manage')
  @ApiOperation({ summary: 'Add a criterion (draft cycles only; weight 0<w<=100)' })
  async addCriterion(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateEvaluationCriterionDto, @CurrentUser('userId') userId: string, @Req() req: Request) {
    await this.evaluationService.getCycle(id, { userId, isAdmin: await this.permissionsService.hasRole(userId, 'admin') });
    return this.evaluationService.addCriterion(id, dto, this.ctx(req, userId));
  }

  @Patch(':id/criteria/:criterionId')
  @RequirePermissions('evaluations.manage')
  @ApiOperation({ summary: 'Update a criterion (draft cycles only)' })
  async updateCriterion(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('criterionId', ParseUUIDPipe) criterionId: string,
    @Body() dto: UpdateEvaluationCriterionDto,
    @CurrentUser('userId') userId: string,
    @Req() req: Request,
  ) {
    await this.evaluationService.getCycle(id, { userId, isAdmin: await this.permissionsService.hasRole(userId, 'admin') });
    return this.evaluationService.updateCriterion(id, criterionId, dto, this.ctx(req, userId));
  }

  @Delete(':id/criteria/:criterionId')
  @RequirePermissions('evaluations.manage')
  @ApiOperation({ summary: 'Delete a criterion (draft cycles only)' })
  async deleteCriterion(@Param('id', ParseUUIDPipe) id: string, @Param('criterionId', ParseUUIDPipe) criterionId: string, @CurrentUser('userId') userId: string, @Req() req: Request) {
    await this.evaluationService.getCycle(id, { userId, isAdmin: await this.permissionsService.hasRole(userId, 'admin') });
    await this.evaluationService.deleteCriterion(id, criterionId, this.ctx(req, userId));
    return { deleted: true };
  }
}

@ApiTags('evaluations')
@ApiBearerAuth()
@Controller('evaluations')
export class EvaluationsController {
  constructor(
    private readonly evaluationService: EvaluationService,
    private readonly permissionsService: PermissionsService,
  ) {}

  private ctx(req: Request, actorId: string) {
    return { actorId, ip: clientIp(req), userAgent: userAgent(req) };
  }

  @Get()
  @RequirePermissions('evaluations.view')
  @ApiOperation({ summary: 'List evaluations (evaluations.view; filters cycleId/internId/evaluatorId/status)' })
  async list(@Query() query: QueryEvaluationsDto, @CurrentUser('userId') userId: string) {
    return this.evaluationService.listEvaluations({
      page: query.page,
      pageSize: query.pageSize,
      cycleId: query.cycleId,
      internId: query.internId,
      evaluatorId: query.evaluatorId,
      status: query.status,
    }, { userId, isAdmin: await this.permissionsService.hasRole(userId, 'admin') });
  }

  @Post()
  @RequirePermissions('evaluations.manage')
  @ApiOperation({
    summary:
      'Create a draft evaluation in an OPEN cycle; evaluator defaults to principal; intern must belong to the cycle scope; ownership enforced (spec 61)',
  })
  async create(@Body() dto: CreateEvaluationDto, @CurrentUser('userId') userId: string, @Req() req: Request) {
    const isAdmin = await this.permissionsService.hasRole(userId, 'admin');
    return this.evaluationService.createEvaluation(dto, { userId, isAdmin }, this.ctx(req, userId));
  }

  @Get(':id')
  @RequirePermissions('evaluations.view')
  @ApiOperation({ summary: 'One evaluation with criterion scores (evaluations.view)' })
  async getOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('userId') userId: string) {
    return this.evaluationService.getEvaluation(id, { userId, isAdmin: await this.permissionsService.hasRole(userId, 'admin') });
  }

  @Patch(':id')
  @RequirePermissions('evaluations.manage')
  @ApiOperation({
    summary:
      'Upsert criterion scores (0..criterion.maxScore) + summary on a draft/submitted evaluation; overallScore is ALWAYS recomputed server-side (spec 12)',
  })
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateEvaluationDto, @CurrentUser('userId') userId: string, @Req() req: Request) {
    const isAdmin = await this.permissionsService.hasRole(userId, 'admin');
    return this.evaluationService.updateEvaluation(id, dto, { userId, isAdmin }, this.ctx(req, userId));
  }

  @Post(':id/submit')
  @RequirePermissions('evaluations.manage')
  @ApiOperation({ summary: 'draft → submitted: validates required criteria + weights == 100 (evaluator-owned)' })
  async submit(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('userId') userId: string, @Req() req: Request) {
    const isAdmin = await this.permissionsService.hasRole(userId, 'admin');
    return { evaluation: await this.evaluationService.submitEvaluation(id, { userId, isAdmin }, this.ctx(req, userId)) };
  }

  @Post(':id/finalize')
  @RequirePermissions('evaluations.manage')
  @ApiOperation({
    summary:
      'submitted → finalized: backend recomputes the weighted overall, locks the evaluation, writes audit + activity and notifies the intern (one transaction)',
  })
  async finalize(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('userId') userId: string, @Req() req: Request) {
    const isAdmin = await this.permissionsService.hasRole(userId, 'admin');
    return { evaluation: await this.evaluationService.finalizeEvaluation(id, { userId, isAdmin }, this.ctx(req, userId)) };
  }

  @Post(':id/revisions')
  @RequirePermissions('evaluations.manage')
  @ApiOperation({
    summary:
      'PRIVILEGED correction of a finalized evaluation (admin policy): stays finalized, revisionNumber++, immutable revision row with previous/new overall + reason (spec 14)',
  })
  async revise(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReviseEvaluationDto, @CurrentUser('userId') userId: string, @Req() req: Request) {
    // Privileged correction is admin policy (spec 14): evaluations.manage
    // alone is NOT sufficient — the admin role is resolved fresh from DB.
    const isAdmin = await this.permissionsService.hasRole(userId, 'admin');
    if (!isAdmin) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'EVALUATION_SCOPE_FORBIDDEN',
        message: 'Evaluation revisions are restricted to administrators.',
      });
    }
    return this.evaluationService.reviseEvaluation(id, dto, userId, this.ctx(req, userId));
  }
}

@ApiTags('intern')
@ApiBearerAuth()
@Controller('intern/me/evaluations')
export class EvaluationInternController {
  constructor(
    private readonly evaluationService: EvaluationService,
    private readonly permissionsService: PermissionsService,
  ) {}

  @Get()
  @RequirePermissions('evaluations.view.own')
  @ApiOperation({ summary: 'My FINALIZED evaluations with scores (identity = principal; drafts/submitted are internal)' })
  async myEvaluations(@CurrentUser('userId') userId: string) {
    return { items: await this.evaluationService.internList(userId) };
  }

  @Get(':id')
  @RequirePermissions('evaluations.view.own')
  @ApiOperation({ summary: 'One of my finalized evaluations (404-safe for foreign/unfinished rows)' })
  async myEvaluation(@CurrentUser('userId') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.evaluationService.internGet(userId, id);
  }
}
