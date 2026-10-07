import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto';

export class QueryUsersDto extends PaginationQueryDto {
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
