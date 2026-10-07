import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { toPaginated } from '../common/pagination/paginated';
import { PaginationQueryDto } from '../common/pagination/pagination-query.dto';
import { Role } from './entities/role.entity';
import { Permission } from './entities/permission.entity';

@ApiTags('rbac')
@ApiBearerAuth()
@Controller()
export class RbacController {
  constructor(
    @InjectRepository(Role) private readonly rolesRepo: Repository<Role>,
    @InjectRepository(Permission) private readonly permissionsRepo: Repository<Permission>,
  ) {}

  @Get('roles')
  @RequirePermissions('roles.read')
  @ApiOperation({ summary: 'Paginated roles (roles.read)' })
  async roles(@Query() query: PaginationQueryDto) {
    const [items, total] = await this.rolesRepo
      .createQueryBuilder('r')
      .orderBy('r.createdAt', 'ASC')
      .skip((query.page - 1) * query.pageSize)
      .take(query.pageSize)
      .getManyAndCount();
    return toPaginated(items, query.page, query.pageSize, total);
  }

  @Get('permissions')
  @RequirePermissions('permissions.read')
  @ApiOperation({ summary: 'Paginated permissions (permissions.read)' })
  async permissions(@Query() query: PaginationQueryDto) {
    const [items, total] = await this.permissionsRepo
      .createQueryBuilder('p')
      .orderBy('p.code', 'ASC')
      .skip((query.page - 1) * query.pageSize)
      .take(query.pageSize)
      .getManyAndCount();
    return toPaginated(items, query.page, query.pageSize, total);
  }
}
