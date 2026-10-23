import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CreateKnowledgeDto, KnowledgeImportDryRunDto, KnowledgePageDto, KnowledgeQueryDto, KnowledgeVersionDto, RestoreKnowledgeDto, UpdateKnowledgeDto } from './knowledge.dto';
import { KnowledgeStore } from './knowledge.store';
import { KnowledgeImportService } from './knowledge-import.service';

@ApiTags('knowledge')
@ApiBearerAuth()
@Controller('admin/knowledge')
@RequirePermissions('knowledge.read')
export class KnowledgeController {
  constructor(private readonly store: KnowledgeStore, private readonly imports: KnowledgeImportService) {}
  @Get() list(@CurrentUser('userId') actor: string, @Query() query: KnowledgeQueryDto) { return this.store.list(actor, query); }
  @Get(':code/revisions') history(@CurrentUser('userId') actor: string, @Param('code') code: string, @Query() query: KnowledgePageDto) { return this.store.history(actor, code, query.page, query.pageSize); }
  @Get(':code') get(@CurrentUser('userId') actor: string, @Param('code') code: string) { return this.store.get(actor, code); }
  @Post() @RequirePermissions('knowledge.read', 'knowledge.manage') create(@CurrentUser('userId') actor: string, @Body() body: CreateKnowledgeDto) { return this.store.saveDraft(actor, body.code, null, body.draft); }
  @Put(':code') @RequirePermissions('knowledge.read', 'knowledge.manage') update(@CurrentUser('userId') actor: string, @Param('code') code: string, @Body() body: UpdateKnowledgeDto) { return this.store.saveDraft(actor, code, body.version, body.draft); }
  @Post('import/dry-run') @HttpCode(200) @RequirePermissions('knowledge.read', 'knowledge.manage') dryRun(@CurrentUser('userId') actor: string, @Body() body: KnowledgeImportDryRunDto) { return this.imports.dryRun(actor, body.entries); }
  @Post(':code/publish') @HttpCode(200) @RequirePermissions('knowledge.read', 'knowledge.publish') publish(@CurrentUser('userId') actor: string, @Param('code') code: string, @Body() body: KnowledgeVersionDto) { return this.store.publish(actor, code, body.version); }
  @Post(':code/archive') @HttpCode(200) @RequirePermissions('knowledge.read', 'knowledge.manage') archive(@CurrentUser('userId') actor: string, @Param('code') code: string, @Body() body: KnowledgeVersionDto) { return this.store.archive(actor, code, body.version); }
  @Post(':code/restore') @HttpCode(200) @RequirePermissions('knowledge.read', 'knowledge.manage') restore(@CurrentUser('userId') actor: string, @Param('code') code: string, @Body() body: RestoreKnowledgeDto) { return this.store.restore(actor, code, body.version, body.sourceVersion); }
}
