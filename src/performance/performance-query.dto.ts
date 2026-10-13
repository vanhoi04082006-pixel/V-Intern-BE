import { IsISO8601, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PerformanceQuery } from './performance.service';

export class PerformanceQueryDto implements PerformanceQuery {
  @IsOptional() @IsUUID('4') sessionId?: string;
  @IsOptional() @IsUUID('4') projectId?: string;
  @IsOptional() @IsISO8601() from?: string;
  @IsOptional() @IsISO8601() to?: string;
  @IsOptional() @IsString() @MaxLength(100) q?: string;
}
