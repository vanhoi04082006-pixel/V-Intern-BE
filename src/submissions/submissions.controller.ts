import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { RequestPrincipal } from '../common/types/request-principal';
import { clientIp, userAgent } from '../common/types/request-info';
import { SubmissionsService } from './submissions.service';
import { ReviewSubmissionDto, SubmitTaskDto } from './submission.dto';
@ApiTags('task submissions') @ApiBearerAuth() @Controller()
export class SubmissionsController {
  constructor(private readonly service: SubmissionsService) {}
  @Get('tasks/:id/submissions')
  list(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestPrincipal) { return this.service.list(id, user); }
  @Post('tasks/:id/submissions') @RequirePermissions('tasks.update.own')
  submit(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SubmitTaskDto, @CurrentUser('userId') actorId: string, @Req() req: Request) {
    return this.service.submit(id, dto, { actorId, ip: clientIp(req), userAgent: userAgent(req) });
  }
  @Post('submissions/:id/review') @RequirePermissions('tasks.manage', 'evaluations.manage')
  review(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReviewSubmissionDto, @CurrentUser('userId') actorId: string, @Req() req: Request) {
    return this.service.review(id, dto, { actorId, ip: clientIp(req), userAgent: userAgent(req) });
  }
}
