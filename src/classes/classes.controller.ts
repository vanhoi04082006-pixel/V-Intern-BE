import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { toPaginated } from '../common/pagination/paginated';
import { clientIp, userAgent } from '../common/types/request-info';
import { ActorContext } from '../users/users.service';
import { ClassesService, toClassResponse } from './classes.service';
import { AddClassMembersDto, CreateClassDto, QueryClassesDto, UpdateClassDto } from './dto/class.dtos';

@ApiTags('classes')
@ApiBearerAuth()
@Controller('classes')
export class ClassesController {
  constructor(private readonly classesService: ClassesService) {}

  private ctx(req: Request, actorId: string): ActorContext {
    return { actorId, ip: clientIp(req), userAgent: userAgent(req) };
  }

  @Get()
  @RequirePermissions('classes.view')
  @ApiOperation({ summary: 'Paginated classes (classes.view; filters: q, status, sessionId)' })
  async list(@Query() query: QueryClassesDto) {
    const { items, total } = await this.classesService.list({
      page: query.page,
      pageSize: query.pageSize,
      q: query.q,
      status: query.status,
      sessionId: query.sessionId,
    });
    return toPaginated(items, query.page, query.pageSize, total);
  }

  @Post()
  @RequirePermissions('classes.manage')
  @ApiOperation({ summary: 'Create class (classes.manage; audited)' })
  async create(
    @Body() dto: CreateClassDto,
    @CurrentUser('userId') actorId: string,
    @Req() req: Request,
  ) {
    return this.classesService.create(dto, this.ctx(req, actorId));
  }

  @Get(':id')
  @RequirePermissions('classes.view')
  @ApiOperation({ summary: 'Class detail (classes.view)' })
  async getOne(@Param('id', ParseUUIDPipe) id: string) {
    return toClassResponse(await this.classesService.getOne(id));
  }

  @Patch(':id')
  @RequirePermissions('classes.manage')
  @ApiOperation({ summary: 'Update class (classes.manage; audited)' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateClassDto,
    @CurrentUser('userId') actorId: string,
    @Req() req: Request,
  ) {
    return this.classesService.update(id, dto, this.ctx(req, actorId));
  }

  @Get(':id/members')
  @RequirePermissions('classes.view')
  @ApiOperation({ summary: 'Class members (classes.view)' })
  async members(@Param('id', ParseUUIDPipe) id: string) {
    return { members: await this.classesService.listMembers(id) };
  }

  @Post(':id/members')
  @RequirePermissions('classes.manage')
  @ApiOperation({ summary: 'Add members (idempotent; audited)' })
  async addMembers(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddClassMembersDto,
    @CurrentUser('userId') actorId: string,
    @Req() req: Request,
  ) {
    return this.classesService.addMembers(id, dto.userIds, this.ctx(req, actorId));
  }

  @Delete(':id/members/:userId')
  @RequirePermissions('classes.manage')
  @ApiOperation({ summary: 'Remove member (audited)' })
  async removeMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser('userId') actorId: string,
    @Req() req: Request,
  ) {
    return this.classesService.removeMember(id, userId, this.ctx(req, actorId));
  }
}
