import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsUUID } from 'class-validator';
export class SummaryIdsQueryDto {
  @Transform(({value}) => typeof value === 'string' ? value.split(',') : value)
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('all', {each:true})
  ids!: string[];
}
export class AcademicSummaryQueryDto extends SummaryIdsQueryDto {
  @IsIn(['sessions','projects'])
  kind!: 'sessions' | 'projects';
}
export class AcademicOverviewQueryDto {
  @IsIn(['sessions','projects'])
  kind!: 'sessions' | 'projects';
}
