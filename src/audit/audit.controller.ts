import {
  Controller,
  Get,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { toPaginated } from '../common/pagination/paginated';
import { AuditService } from './audit.service';
import { ActivityService } from './activity.service';
import { QueryActivityEventsDto } from './dto/query-activity-events.dto';
import { QueryAuditLogsDto } from './dto/query-audit-logs.dto';

/**
 * Audit logs (security/compliance) and activity events (user feed) are two
 * distinct read models from two distinct tables — never conflated.
 */
@ApiTags('audit')
@ApiBearerAuth()
@Controller()
export class AuditController {
  constructor(
    private readonly auditService: AuditService,
    private readonly activityService: ActivityService,
  ) {}

  @Get('audit-logs')
  @RequirePermissions('audit.read')
  @ApiOperation({ summary: 'Paginated audit trail (audit.read)' })
  @ApiOkResponse({ description: 'Paginated audit logs' })
  async auditLogs(@Query() query: QueryAuditLogsDto) {
    const { items, total } = await this.auditService.list({
      page: query.page,
      pageSize: query.pageSize,
      actorId: query.actorId,
      action: query.action,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
    });
    return toPaginated(items, query.page, query.pageSize, total);
  }

  @Get('activity-events')
  @RequirePermissions('activity.read')
  @ApiOperation({ summary: 'Paginated recent activity (activity.read)' })
  async activityEvents(@Query() query: QueryActivityEventsDto) {
    const { items, total } = await this.activityService.list({
      page: query.page,
      pageSize: query.pageSize,
      actorId: query.actorId,
      module: query.module,
    });
    return toPaginated(items, query.page, query.pageSize, total);
  }
}
