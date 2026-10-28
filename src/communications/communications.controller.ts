import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CommunicationsService } from './communications.service';
class MailPage { @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(10000) page = 1; }
class ResendMail { @IsOptional() @IsBoolean() acknowledgeUncertain = false; }
@Controller('admin/communications')
@RequirePermissions('communications.manage')
export class CommunicationsController {
  constructor(private readonly mail: CommunicationsService) {}
  @Get() list(@Query() q: MailPage) { return this.mail.list(q.page); }
  @Get(':id/preview') preview(@Param('id', ParseUUIDPipe) id: string) { return this.mail.preview(id); }
  @Post(':id/resend') resend(@Param('id', ParseUUIDPipe) id: string, @Body() body: ResendMail) { return this.mail.resend(id, body.acknowledgeUncertain); }
}
