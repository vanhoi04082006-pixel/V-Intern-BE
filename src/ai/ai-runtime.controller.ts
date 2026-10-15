import { Body, Controller, Get, Put } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { AiRuntimeService } from './ai-runtime.service';
@Controller('admin/ai-configuration')
export class AiRuntimeController {
  constructor(private readonly runtime: AiRuntimeService) {}
  @Get() @RequirePermissions('settings.read') get(@CurrentUser('userId') actor: string) { return this.runtime.get(actor); }
  @Put() @RequirePermissions('settings.update') update(@CurrentUser('userId') actor: string, @Body() input: unknown) { return this.runtime.update(actor, input); }
}
