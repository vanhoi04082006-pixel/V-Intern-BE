import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsInt, IsISO8601, IsOptional, IsString, IsUUID, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
export class CreateClassLessonDto {
  @IsString() @MinLength(1) @MaxLength(256) title!: string;
  @IsISO8601({ strict: true }) startsAt!: string;
  @IsISO8601({ strict: true }) endsAt!: string;
  @IsIn(['online', 'on_site']) mode!: 'online' | 'on_site';
  @IsString() @MaxLength(256) location!: string;
}
export class UpdateClassLessonDto extends CreateClassLessonDto {
  @IsInt() @Min(1) version!: number;
  @IsIn(['scheduled', 'completed', 'cancelled']) status!: 'scheduled' | 'completed' | 'cancelled';
}
export class AttendanceMarkDto {
  @IsUUID() userId!: string;
  @IsIn(['present', 'late', 'absent', 'excused']) status!: 'present' | 'late' | 'absent' | 'excused';
  @IsOptional() @IsString() @MaxLength(512) note?: string;
}
export class SaveAttendanceDto {
  @IsInt() @Min(1) version!: number;
  @IsArray() @ArrayMaxSize(2000) @ValidateNested({ each: true }) @Type(() => AttendanceMarkDto) marks!: AttendanceMarkDto[];
}
export class ClassAnnouncementDto {
  @IsString() @MinLength(1) @MaxLength(256) title!: string;
  @IsString() @MinLength(1) @MaxLength(2000) body!: string;
}
