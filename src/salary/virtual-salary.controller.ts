import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { PaginationQueryDto } from '../common/pagination/pagination-query.dto';
import { clientIp, userAgent } from '../common/types/request-info';
import { CreateSalaryAdjustmentDto } from './dto/virtual-salary.dtos';
import type { VirtualSalaryLedgerType } from './entities/virtual-salary-ledger.entity';
import { VirtualSalaryService } from './virtual-salary.service';

@ApiTags('virtual-salary')
@ApiBearerAuth()
@Controller('virtual-salary')
export class VirtualSalaryController {
  constructor(private readonly salaryService: VirtualSalaryService) {}

  private ctx(req: Request, actorId: string) {
    return { actorId, ip: clientIp(req), userAgent: userAgent(req) };
  }

  @Post('generate/:kpiPeriodId')
  @RequirePermissions('virtual_salary.manage')
  @ApiOperation({
    summary:
      'Generate virtual salary from a FINALIZED KPI period (admin): base from the virtual_salary.base_amount setting (missing → 409 VIRTUAL_SALARY_CONFIG_MISSING); UNIQUE idempotencyKey — regenerating never duplicates rows (spec 34/36)',
  })
  async generate(@Param('kpiPeriodId', ParseUUIDPipe) kpiPeriodId: string, @CurrentUser('userId') userId: string, @Req() req: Request) {
    return this.salaryService.generateForPeriod(kpiPeriodId, userId, this.ctx(req, userId));
  }

  @Post('adjustments')
  @RequirePermissions('virtual_salary.manage')
  @ApiOperation({
    summary:
      'Ledger adjustment (admin): bonus (+), penalty (−), signed adjustment, or reversal of an existing row — always reason + audit + notification; no hidden balance edits exist anywhere (spec 37/38)',
  })
  async adjust(@Body() dto: CreateSalaryAdjustmentDto, @CurrentUser('userId') userId: string, @Req() req: Request) {
    return this.salaryService.adjust(
      { ...dto, type: dto.type as VirtualSalaryLedgerType },
      userId,
      this.ctx(req, userId),
    );
  }

  @Get()
  @RequirePermissions('virtual_salary.view')
  @ApiOperation({ summary: 'Ledger list (admin; filters userId/type/kpiPeriodId + pagination)' })
  async list(@Query() query: PaginationQueryDto & { userId?: string; type?: string; kpiPeriodId?: string }) {
    return this.salaryService.listLedger({
      page: query.page,
      pageSize: query.pageSize,
      userId: query.userId,
      type: query.type,
      kpiPeriodId: query.kpiPeriodId,
    });
  }

  @Get('users/:userId/balance')
  @RequirePermissions('virtual_salary.view')
  @ApiOperation({
    summary:
      'Ledger-derived balance for one user (admin): { balance, unit, virtual: true, earnedThisPeriod, latestEntries } — SUM(ledger.amount), never a stored value (spec 40)',
  })
  async balance(@Param('userId', ParseUUIDPipe) userId: string, @Query('kpiPeriodId') kpiPeriodId?: string) {
    return this.salaryService.balance(userId, kpiPeriodId || undefined);
  }
}

@ApiTags('intern')
@ApiBearerAuth()
@Controller('intern/me/virtual-salary')
export class VirtualSalaryInternController {
  constructor(private readonly salaryService: VirtualSalaryService) {}

  @Get()
  @RequirePermissions('virtual_salary.view.own')
  @ApiOperation({
    summary:
      'My VIRTUAL salary balance (identity = principal): { balance, unit, virtual: true, latestEntries } — derived from the ledger; this is a virtual unit and NEVER real payroll (spec 33)',
  })
  async myBalance(@CurrentUser('userId') userId: string, @Query('kpiPeriodId') kpiPeriodId?: string) {
    return this.salaryService.balance(userId, kpiPeriodId || undefined);
  }

  @Get('ledger')
  @RequirePermissions('virtual_salary.view.own')
  @ApiOperation({ summary: 'My ledger entries (identity = principal; optional kpiPeriodId filter + pagination)' })
  async myLedger(@CurrentUser('userId') userId: string, @Query() query: PaginationQueryDto & { kpiPeriodId?: string }) {
    return this.salaryService.internLedger(userId, {
      page: query.page,
      pageSize: query.pageSize,
      kpiPeriodId: query.kpiPeriodId,
    });
  }
}
