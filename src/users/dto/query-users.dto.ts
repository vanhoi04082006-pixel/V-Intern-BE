import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto';

export class QueryUsersDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Effective role code, direct or inherited from a group', maxLength: 64 })
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9_.-]{1,64}$/)
  roleCode?: string;
  @ApiPropertyOptional({ maxLength: 128 })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  q?: string;

  @ApiPropertyOptional({ enum: ['active', 'pending', 'locked', 'deleted'] })
  @IsOptional()
  @IsIn(['active', 'pending', 'locked', 'deleted'])
  status?: 'active' | 'pending' | 'locked' | 'deleted';
}
