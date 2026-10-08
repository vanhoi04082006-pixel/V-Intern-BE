import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { clientIp, userAgent } from '../common/types/request-info';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { toPaginated } from '../common/pagination/paginated';
import { ActorContext, UsersService } from './users.service';
import { CreateUserDto, SetUserStatusDto, UpdateUserDto } from './dto/user.dtos';
import { QueryUsersDto } from './dto/query-users.dto';
import { toUserResponse } from './user-response';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  private ctx(req: Request, actorId: string): ActorContext {
    return { actorId, ip: clientIp(req), userAgent: userAgent(req) };
  }

  @Get()
  @RequirePermissions('users.read')
  @ApiOperation({ summary: 'Paginated user list (users.read)' })
  async list(@Query() query: QueryUsersDto) {
    const { items, total } = await this.usersService.list({
      page: query.page,
      pageSize: query.pageSize,
      q: query.q,
      status: query.status,
      roleCode: query.roleCode,
    });
    return toPaginated(items, query.page, query.pageSize, total);
  }

  @Post()
  @RequirePermissions('users.create')
  @ApiOperation({ summary: 'Create user (users.create; audited)' })
  async create(
    @Body() dto: CreateUserDto,
    @CurrentUser('userId') actorId: string,
    @Req() req: Request,
  ) {
    return this.usersService.create(dto, this.ctx(req, actorId));
  }

  @Get(':id')
  @RequirePermissions('users.read')
  @ApiOperation({ summary: 'Get one user (users.read)' })
  async getOne(@Param('id', ParseUUIDPipe) id: string) {
    return toUserResponse(await this.usersService.getOne(id));
  }

  @Patch(':id')
  @RequirePermissions('users.update')
  @ApiOperation({ summary: 'Update profile fields (users.update; audited)' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser('userId') actorId: string,
    @Req() req: Request,
  ) {
    return this.usersService.update(id, dto, this.ctx(req, actorId));
  }

  @Patch(':id/status')
  @RequirePermissions('users.status')
  @ApiOperation({ summary: 'Set account status (users.status; audited)' })
  async setStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetUserStatusDto,
    @CurrentUser('userId') actorId: string,
    @Req() req: Request,
  ) {
    return this.usersService.setStatus(id, dto.status, this.ctx(req, actorId));
  }
}
