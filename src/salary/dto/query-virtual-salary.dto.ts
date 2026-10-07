import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto';
import { VIRTUAL_SALARY_LEDGER_TYPES } from '../entities/virtual-salary-ledger.entity';

/**
 * Dedicated query DTOs (NOT intersection types): @Query() with an
 * intersection type loses the class-transformer mapping, so
 * PaginationQueryDto defaults (page=1/pageSize=20) never applied and
 * skip(NaN) crashed with 500 — the defect the CI run isolated. Proper
 * subclasses keep the metadata (and therefore the defaults) intact.
 */
export class QueryVirtualSalaryLedgerDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  userId?: string;

  @ApiPropertyOptional({ enum: VIRTUAL_SALARY_LEDGER_TYPES })
  @IsOptional()
  @IsIn(VIRTUAL_SALARY_LEDGER_TYPES as unknown as string[])
  type?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  kpiPeriodId?: string;
}

export class QueryInternLedgerDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  kpiPeriodId?: string;
}
