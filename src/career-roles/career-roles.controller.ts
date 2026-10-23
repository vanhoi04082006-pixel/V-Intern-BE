import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CareerRolePageDto, CareerRoleQueryDto, CareerRoleVersionDto, CreateCareerRoleDto, UpdateCareerRoleDto } from './career-role.dto';
import { CareerRolesService } from './career-roles.service';

@ApiTags('career-roles')
@Controller('admin/career-roles')
@RequirePermissions('recruitment.manage')
export class CareerRolesAdminController {
  constructor(private readonly roles: CareerRolesService) {}
  @Get() list(@CurrentUser('userId') actor: string, @Query() q: CareerRoleQueryDto) { return this.roles.list(actor, q); }
  @Get(':code/revisions') revisions(@CurrentUser('userId') actor: string, @Param('code') code: string, @Query() q: CareerRolePageDto) { return this.roles.revisions(actor, code, q); }
  @Get(':code') get(@CurrentUser('userId') actor: string, @Param('code') code: string) { return this.roles.get(actor, code); }
  @Post() create(@CurrentUser('userId') actor: string, @Body() body: CreateCareerRoleDto) { return this.roles.create(actor, body); }
  @Put(':code') update(@CurrentUser('userId') actor: string, @Param('code') code: string, @Body() body: UpdateCareerRoleDto) { return this.roles.update(actor, code, body); }
  @Post(':code/archive') archive(@CurrentUser('userId') actor: string, @Param('code') code: string, @Body() body: CareerRoleVersionDto) { return this.roles.archive(actor, code, body.version); }
}

@ApiTags('career-roles')
@Controller('career-roles')
export class CareerRolesCatalogController {
  constructor(private readonly roles: CareerRolesService) {}
  @Get() list() { return this.roles.listRecruiting(); }
}
