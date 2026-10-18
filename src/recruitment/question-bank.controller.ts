import { Body, Controller, Delete, Get, Param, ParseIntPipe, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { QuestionBankQueryDto, QuestionContentDto, UpdateQuestionDto } from './question-bank.dto';
import { QuestionBankService } from './question-bank.service';
@Controller('admin/question-bank')
@RequirePermissions('recruitment.manage')
export class QuestionBankController {
  constructor(private readonly bank: QuestionBankService) {}
  @Get() list(@CurrentUser('userId') actor: string, @Query() q: QuestionBankQueryDto) { return this.bank.list(actor, q); }
  @Get(':id') get(@CurrentUser('userId') actor: string, @Param('id', ParseUUIDPipe) id: string) { return this.bank.get(actor, id); }
  @Post() create(@CurrentUser('userId') actor: string, @Body() input: QuestionContentDto) { return this.bank.save(actor, input); }
  @Put(':id') update(@CurrentUser('userId') actor: string, @Param('id', ParseUUIDPipe) id: string, @Body() input: UpdateQuestionDto) { return this.bank.save(actor, input, id); }
  @Delete(':id') retire(@CurrentUser('userId') actor: string, @Param('id', ParseUUIDPipe) id: string, @Query('version', ParseIntPipe) version: number) { return this.bank.retire(actor, id, version); }
}
