import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { CAREER_ROLE_STATUSES, CareerRoleStatus } from './entities/career-role.entity';

const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;
const trimItems = ({ value }: { value: unknown }) => Array.isArray(value) ? value.map(v => typeof v === 'string' ? v.trim() : v) : value;

export class CareerRoleContentDto {
  @Transform(trim) @IsString() @MinLength(2) @MaxLength(128)
  name!: string;

  @Transform(trim) @IsString() @MaxLength(2000)
  description!: string;

  @IsIn(['intern', 'junior'])
  level!: string;

  @IsIn(['vi', 'en'])
  language!: string;

  @Transform(trimItems) @IsArray() @ArrayMaxSize(30) @IsString({ each: true }) @MinLength(1, { each: true }) @MaxLength(80, { each: true })
  requiredSkills!: string[];

  @Transform(trimItems) @IsArray() @ArrayMaxSize(30) @IsString({ each: true }) @MinLength(1, { each: true }) @MaxLength(80, { each: true })
  optionalSkills!: string[];

  @IsObject()
  competencyWeights!: Record<string, number>;
}

export class CreateCareerRoleDto extends CareerRoleContentDto {
  @Transform(trim) @IsString() @Matches(/^[a-z][a-z0-9_]{1,31}$/)
  code!: string;
}

export class CareerRoleVersionDto {
  @IsInt() @Min(1) @Max(2147483646)
  version!: number;
}

export class UpdateCareerRoleDto extends CareerRoleContentDto {
  @IsInt() @Min(1) @Max(2147483646)
  version!: number;

  @IsIn(CAREER_ROLE_STATUSES)
  status!: CareerRoleStatus;

  @IsBoolean()
  acceptingApplications!: boolean;
}

export class CareerRolePageDto {
  @Type(() => Number) @IsInt() @Min(1) @Max(100000)
  page = 1;

  @Type(() => Number) @IsInt() @Min(1) @Max(100)
  pageSize = 25;
}

export class CareerRoleQueryDto extends CareerRolePageDto {
  @IsOptional() @IsIn(CAREER_ROLE_STATUSES)
  status?: CareerRoleStatus;

  @IsOptional() @Transform(trim) @IsString() @MaxLength(128)
  search?: string;
}
