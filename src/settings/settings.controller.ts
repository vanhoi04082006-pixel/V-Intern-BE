import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import type { Request } from 'express';
import { Req } from '@nestjs/common';
import { clientIp, userAgent } from '../common/types/request-info';
import { ActorContext } from '../users/users.service';
import { SettingsService } from './settings.service';

class UpdateSettingDto {
  @IsString()
  @Matches(/^[a-z0-9._-]{1,128}$/, { message: 'Key must be 1-128 chars: a-z, 0-9, dot, dash, underscore.' })
  key!: string;

  @IsString()
  @MaxLength(100000)
  value!: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  description?: string;
}

@ApiTags('settings')
@ApiBearerAuth()
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  @RequirePermissions('settings.read')
  @ApiOperation({ summary: 'All system settings (settings.read)' })
  async list() {
    return { settings: await this.settingsService.all() };
  }

  @Patch()
  @RequirePermissions('settings.update')
  @ApiOperation({ summary: 'Upsert one setting (settings.update; audited)' })
  async update(
    @Body() dto: UpdateSettingDto,
    @CurrentUser('userId') actorId: string,
    @Req() req: Request,
  ) {
    const ctx: ActorContext = { actorId, ip: clientIp(req), userAgent: userAgent(req) };
    await this.settingsService.upsert(dto, ctx);
    return { settings: await this.settingsService.all() };
  }
}
