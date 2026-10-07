import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { PaginationQueryDto } from '../common/pagination/pagination-query.dto';
import { clientIp, userAgent } from '../common/types/request-info';
import { PermissionsService } from '../rbac/permissions.service';
import { CreateKpiPeriodDto, TransitionKpiPeriodDto, UpdateKpiPeriodDto } from './dto/kpi.dtos';
import { KpiService } from './kpi.service';

@ApiTags('kpi-periods')
@ApiBearerAuth()
@Controller('kpi-periods')
export class KpiPeriodsController {
  constructor(
    private readonly kpiService: KpiService,
    private readonly permissionsService: PermissionsService,
  ) {}

  private ctx(req: Request, actorId: string) {
    return { actorId, ip: clientIp(req), userAgent: userAgent(req) };
  }

  @Get()
  @RequirePermissions('kpi.view')
  @ApiOperation({ summary: 'List KPI periods (kpi.view; filter: status)' })
  async list(@Query() query: PaginationQueryDto & { status?: string }) {
    return this.kpiService.listPeriods({ page: query.page, pageSize: query.pageSize, status: query.status });
  }

  @Post()
  @RequirePermissions('kpi.manage')
  @ApiOperation({ summary: 'Create a KPI period (kpi.manage = admin policy): ruleVersion is pinned to kpi-v1' })
  async create(@Body() dto: CreateKpiPeriodDto, @CurrentUser('userId') userId: string, @Req() req: Request) {
    return this.kpiService.createPeriod(dto, this.ctx(req, userId));
  }

  @Get(':id')
  @RequirePermissions('kpi.view')
  @ApiOperation({ summary: 'One KPI period (kpi.view)' })
  async getOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.kpiService.getPeriod(id);
  }

  @Patch(':id')
  @RequirePermissions('kpi.manage')
  @ApiOperation({ summary: 'Edit draft/open periods only — code + ruleVersion are immutable (spec 76)' })
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateKpiPeriodDto, @CurrentUser('userId') userId: string, @Req() req: Request) {
    return this.kpiService.updatePeriod(id, dto, this.ctx(req, userId));
  }

  @Post(':id/status')
  @RequirePermissions('kpi.manage')
  @ApiOperation({
    summary:
      'Explicit KPI period state transition (draft→open, open→finalized, finalized→closed); calculating is engine-managed; finalize from open only (spec 23)',
  })
  async changeStatus(@Param('id', ParseUUIDPipe) id: string, @Body() dto: TransitionKpiPeriodDto, @CurrentUser('userId') userId: string, @Req() req: Request) {
    return this.kpiService.changeStatus(id, dto.status, this.ctx(req, userId));
  }

  @Post(':id/calculate')
  @RequirePermissions('kpi.manage')
  @ApiOperation({
    summary:
      'Run the deterministic kpi-v1 batch (open→calculating→open): per-user results + full component provenance; concurrent request → 409 KPI_CALCULATION_IN_PROGRESS; finalized periods never recalculate (spec 27/28)',
  })
  async calculate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('userId') userId: string, @Req() req: Request) {
    return this.kpiService.calculate(id, userId, this.ctx(req, userId));
  }

  @Post(':id/finalize')
  @RequirePermissions('kpi.manage')
  @ApiOperation({
    summary: 'open → finalized: locks the period permanently and notifies interns with calculated results (spec 28)',
  })
  async finalize(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('userId') userId: string, @Req() req: Request) {
    return this.kpiService.finalize(id, userId, this.ctx(req, userId));
  }

  @Get(':id/results')
  @RequirePermissions('kpi.view')
  @ApiOperation({ summary: 'Persisted KPI results of the period, best-first (kpi.view)' })
  async results(@Param('id', ParseUUIDPipe) id: string, @Query() query: PaginationQueryDto) {
    return this.kpiService.listResults(id, { page: query.page, pageSize: query.pageSize });
  }
}

@ApiTags('kpi-results')
@ApiBearerAuth()
@Controller('kpi-results')
export class KpiResultsController {
  constructor(private readonly kpiService: KpiService) {}

  @Get(':id')
  @RequirePermissions('kpi.view')
  @ApiOperation({ summary: 'One KPI result with FULL component provenance (values, configured/effective weights, contributions) (kpi.view)' })
  async getOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.kpiService.getResult(id);
  }
}

@ApiTags('intern')
@ApiBearerAuth()
@Controller('intern/me/kpi')
export class KpiInternController {
  constructor(private readonly kpiService: KpiService) {}

  @Get()
  @RequirePermissions('kpi.view.own')
  @ApiOperation({ summary: 'My KPI results with their periods (identity = principal)' })
  async myResults(@CurrentUser('userId') userId: string) {
    return { items: await this.kpiService.internResults(userId) };
  }

  @Get(':id')
  @RequirePermissions('kpi.view.own')
  @ApiOperation({ summary: 'One of my KPI results incl. provenance (404-safe for foreign results)' })
  async myResult(@CurrentUser('userId') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.kpiService.internResult(userId, id);
  }
}
