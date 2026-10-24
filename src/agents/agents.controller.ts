import { Body, Controller, Get, HttpCode, HttpException, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { AgentRuntimeError } from './contracts/agent-errors';
import { AgentRuntimeService } from './runtime/agent-runtime.service';

export class CreateKnowledgeAgentDto {
  @ApiProperty({ format: 'uuid', description: 'Client-generated UUID; reuse only for the identical request.' })
  @IsUUID() requestId!: string;
  @ApiProperty({ minLength: 3, maxLength: 1000 })
  @IsString() @MinLength(3) @MaxLength(1000) question!: string;
  @ApiPropertyOptional({ description: 'Published career code; this never grants an authorization role.' })
  @IsOptional() @IsString() @Matches(/^[a-z][a-z0-9_]{1,31}$/) roleCode?: string;
}
@ApiTags('agents') @ApiBearerAuth()
@Controller('admin/agents/knowledge-runs') @RequirePermissions('knowledge.read')
export class AgentsController {
  constructor(private readonly runtime: AgentRuntimeService) {}
  private async respond<T>(work: () => Promise<T>): Promise<T> {
    try { return await work(); } catch (error) {
      if (!(error instanceof AgentRuntimeError)) throw error;
      const status = error.code === 'AGENT_RUN_NOT_FOUND' ? 404 : error.code === 'AGENT_INPUT_INVALID' ? 400 : 409;
      throw new HttpException({ code: error.code, message: 'Không thể thực hiện thao tác Agent. Kiểm tra trạng thái lượt chạy.' }, status);
    }
  }
  @Post() @HttpCode(202)
  create(@CurrentUser('userId') actor: string, @Body() body: CreateKnowledgeAgentDto) {
    return this.respond(async () => {
      const run = await this.runtime.create(actor, { ...body });
      if (run.status === 'queued') void this.runtime.execute(actor, run.id).catch(() => undefined);
      return run;
    });
  }
  @Get(':id') get(@CurrentUser('userId') actor: string, @Param('id') id: string) { return this.respond(() => this.runtime.get(actor, id)); }
  @Post(':id/cancel') @HttpCode(200)
  cancel(@CurrentUser('userId') actor: string, @Param('id') id: string) { return this.respond(() => this.runtime.cancel(actor, id)); }
  @Post(':id/resume') @HttpCode(202)
  resume(@CurrentUser('userId') actor: string, @Param('id') id: string) {
    return this.respond(async () => {
      const run = await this.runtime.get(actor, id);
      if (run.status !== 'failed' || !run.retryable) throw new AgentRuntimeError('AGENT_RUN_TERMINAL');
      if (run.attempts >= 3) throw new AgentRuntimeError('AGENT_RETRY_BUDGET');
      if (new Date(run.deadlineAt).getTime() <= Date.now()) throw new AgentRuntimeError('AGENT_RUN_EXPIRED');
      void this.runtime.execute(actor, id, true).catch(() => undefined);
      return { id, accepted: true };
    });
  }
}
