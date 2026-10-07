import { Controller, Get, HttpCode, Param, Post, Put, Query, Body } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { toPaginated } from '../common/pagination/paginated';
import { NotificationsService } from './notifications.service';
import { QueryNotificationsDto } from './dto/query-notifications.dto';
import { SetPreferenceDto } from './dto/set-preference.dto';

/** Self-service notifications — ownership is enforced on every operation. */
@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Own notifications (paginated, optional unread filter)' })
  async list(@CurrentUser('userId') userId: string, @Query() query: QueryNotificationsDto) {
    const { items, total } = await this.notifications.list(userId, {
      page: query.page,
      pageSize: query.pageSize,
      unread: query.unread,
    });
    return toPaginated(items, query.page, query.pageSize, total);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Unread badge count' })
  async unreadCount(@CurrentUser('userId') userId: string) {
    return { count: await this.notifications.unreadCount(userId) };
  }

  @Get('preferences')
  @ApiOperation({ summary: 'Effective preferences (missing row = enabled)' })
  async preferences(@CurrentUser('userId') userId: string) {
    return { preferences: await this.notifications.preferences(userId) };
  }

  @Put('preferences')
  @ApiOperation({ summary: 'Upsert one preference' })
  async setPreference(
    @CurrentUser('userId') userId: string,
    @Body() dto: SetPreferenceDto,
  ) {
    await this.notifications.setPreference(userId, dto.category, dto.enabled);
    return { preferences: await this.notifications.preferences(userId) };
  }

  @Post(':id/read')
  @HttpCode(204)
  @ApiOperation({ summary: 'Mark one as read (ownership enforced)' })
  async markRead(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    await this.notifications.markRead(userId, id);
  }

  @Post('read-all')
  @HttpCode(200)
  @ApiOperation({ summary: 'Mark all as read' })
  async markAllRead(@CurrentUser('userId') userId: string) {
    return { updated: await this.notifications.markAllRead(userId) };
  }
}
