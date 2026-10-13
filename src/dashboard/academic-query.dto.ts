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
  @IsIn(['classes','sessions','projects'])
  kind!: 'classes' | 'sessions' | 'projects';
}
export class AcademicOverviewQueryDto {
  @IsIn(['classes','sessions','projects'])
  kind!: 'classes' | 'sessions' | 'projects';
}
