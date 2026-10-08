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
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Matches, MaxLength, Min, MinLength } from 'class-validator';
import type { Request } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { toPaginated } from '../common/pagination/paginated';
import { PaginationQueryDto } from '../common/pagination/pagination-query.dto';
import { clientIp, userAgent } from '../common/types/request-info';
import { ActorContext } from '../users/users.service';
import { CatalogsService } from './catalogs.service';

class CreateCatalogTypeDto {
  @IsString()
  @Matches(/^[a-z0-9_.-]{3,64}$/, { message: 'Code must be 3-64 chars: a-z, 0-9, dot, dash, underscore.' })
  code!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  description?: string;
}

class CreateCatalogItemDto {
  @IsString()
  @Matches(/^[a-z0-9_.-]{3,64}$/, { message: 'Type code must be 3-64 chars.' })
  typeCode!: string;

  @IsString()
  @Matches(/^[a-z0-9_.-]{1,64}$/, { message: 'Code must be 1-64 chars: a-z, 0-9, dot, dash, underscore.' })
  code!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  value?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  sortOrder?: number;
}

class UpdateCatalogItemDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  value?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

class QueryCatalogItemsDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9_.-]{3,64}$/)
  typeCode?: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  includeInactive?: boolean;
}

@ApiTags('catalogs')
@ApiBearerAuth()
@Controller('catalogs')
export class CatalogsController {
  constructor(private readonly catalogsService: CatalogsService) {}

  private ctx(req: Request, actorId: string): ActorContext {
    return { actorId, ip: clientIp(req), userAgent: userAgent(req) };
  }

  @Get('types')
  @RequirePermissions('catalogs.read')
  @ApiOperation({ summary: 'Paginated catalog types (catalogs.read)' })
  async types(@Query() query: PaginationQueryDto) {
    const { items, total } = await this.catalogsService.listTypes({
      page: query.page,
      pageSize: query.pageSize,
    });
    return toPaginated(items, query.page, query.pageSize, total);
  }

  @Get('items')
  @RequirePermissions('catalogs.read')
  @ApiOperation({ summary: 'Paginated items of a type (?typeCode=…)' })
  async items(@Query() query: QueryCatalogItemsDto) {
    if (!query.typeCode) {
      return toPaginated([], query.page, query.pageSize, 0);
    }
    const { items, total } = await this.catalogsService.listItems(query.typeCode, {
      page: query.page,
      pageSize: query.pageSize,
      includeInactive: query.includeInactive,
    });
    return toPaginated(items, query.page, query.pageSize, total);
  }

  @Post('types')
  @RequirePermissions('catalogs.manage')
  @ApiOperation({ summary: 'Create catalog type (catalogs.manage; audited)' })
  async createType(
    @Body() dto: CreateCatalogTypeDto,
    @CurrentUser('userId') actorId: string,
    @Req() req: Request,
  ) {
    return this.catalogsService.createType(dto, this.ctx(req, actorId));
  }

  @Post('items')
  @RequirePermissions('catalogs.manage')
  @ApiOperation({ summary: 'Create catalog item (catalogs.manage; audited)' })
  async createItem(
    @Body() dto: CreateCatalogItemDto,
    @CurrentUser('userId') actorId: string,
    @Req() req: Request,
  ) {
    return this.catalogsService.createItem(dto, this.ctx(req, actorId));
  }

  @Patch('items/:id')
  @RequirePermissions('catalogs.manage')
  @ApiOperation({ summary: 'Update catalog item (catalogs.manage; audited)' })
  async updateItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCatalogItemDto,
    @CurrentUser('userId') actorId: string,
    @Req() req: Request,
  ) {
    return this.catalogsService.updateItem(id, dto, this.ctx(req, actorId));
  }
}
