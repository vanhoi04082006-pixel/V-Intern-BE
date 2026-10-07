import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * Single server pagination contract (fixes the raw snapshot's mixed formats).
 * Max page size is enforced here — services must not bypass it.
 */
export class PaginationQueryDto {
  @ApiProperty({ minimum: 1, default: 1, required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page: number = 1;

  @ApiProperty({ minimum: 1, maximum: 100, default: 20, required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  pageSize: number = 20;
}
