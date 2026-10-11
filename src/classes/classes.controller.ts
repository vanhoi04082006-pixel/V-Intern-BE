import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
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
import { PermissionsService } from '../rbac/permissions.service';
import { resolveOwnership } from '../rbac/ownership';
import { ClassesService, toClassResponse } from './classes.service';
import { AddClassMembersDto, CreateClassDto, QueryClassesDto, UpdateClassDto } from './dto/class.dtos';
import { ClassLessonsService } from './class-lessons.service';
import { ClassAnnouncementDto, CreateClassLessonDto, SaveAttendanceDto, UpdateClassLessonDto } from './dto/class-lesson.dtos';

@ApiTags('classes')
@ApiBearerAuth()
@Controller('classes')
export class ClassesController {
  constructor(private readonly classesService: ClassesService, private readonly lessons: ClassLessonsService, private readonly permissionsService: PermissionsService) {}

  private ownership(userId: string) {
    return resolveOwnership(this.permissionsService, userId);
  }

  private ctx(req: Request, actorId: string): ActorContext {
    return { actorId, ip: clientIp(req), userAgent: userAgent(req) };
  }

  @Get(':id/lessons')
  @RequirePermissions('classes.view')
  listLessons(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('userId') actorId: string) { return this.lessons.list(id, actorId); }

  @Post(':id/lessons')
  @RequirePermissions('classes.manage')
  createLesson(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateClassLessonDto, @CurrentUser('userId') actorId: string, @Req() req: Request) { return this.lessons.create(id, dto, this.ctx(req, actorId)); }

  @Patch(':id/lessons/:lessonId')
  @RequirePermissions('classes.manage')
  updateLesson(@Param('id', ParseUUIDPipe) id: string, @Param('lessonId', ParseUUIDPipe) lessonId: string, @Body() dto: UpdateClassLessonDto, @CurrentUser('userId') actorId: string, @Req() req: Request) { return this.lessons.update(id, lessonId, dto, this.ctx(req, actorId)); }

  @Get(':id/lessons/:lessonId/attendance')
  @RequirePermissions('classes.view')
  lessonAttendance(@Param('id', ParseUUIDPipe) id: string, @Param('lessonId', ParseUUIDPipe) lessonId: string, @CurrentUser('userId') actorId: string) { return this.lessons.attendance(id, lessonId, actorId); }

  @Put(':id/lessons/:lessonId/attendance')
  @RequirePermissions('classes.manage')
  saveLessonAttendance(@Param('id', ParseUUIDPipe) id: string, @Param('lessonId', ParseUUIDPipe) lessonId: string, @Body() dto: SaveAttendanceDto, @CurrentUser('userId') actorId: string, @Req() req: Request) { return this.lessons.saveAttendance(id, lessonId, dto, this.ctx(req, actorId)); }

  @Post(':id/announcements')
  @RequirePermissions('classes.manage')
  announce(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ClassAnnouncementDto, @CurrentUser('userId') actorId: string, @Req() req: Request) { return this.lessons.announce(id, dto, this.ctx(req, actorId)); }

  @Get()
  @RequirePermissions('classes.view')
  @ApiOperation({ summary: 'Paginated classes (classes.view; filters: q, status, sessionId; lead-instructor scope)' })
  async list(@Query() query: QueryClassesDto, @CurrentUser('userId') userId: string) {
    const { items, total } = await this.classesService.list({
      page: query.page,
      pageSize: query.pageSize,
      q: query.q,
      status: query.status,
      sessionId: query.sessionId,
      leadInstructorId: query.leadInstructorId,
    }, await this.ownership(userId));
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
  @ApiOperation({ summary: 'Class detail (classes.view; lead-instructor scope)' })
  async getOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('userId') userId: string) {
    return toClassResponse(await this.classesService.getOne(id, await this.ownership(userId)));
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
  @ApiOperation({ summary: 'Class members (classes.view; lead-instructor scope)' })
  async members(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('userId') userId: string) {
    return { members: await this.classesService.listMembers(id, await this.ownership(userId)) };
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
