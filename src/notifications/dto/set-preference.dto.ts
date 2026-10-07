import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsIn } from 'class-validator';
import { NOTIFICATION_CATEGORIES } from '../notifications.service';

export class SetPreferenceDto {
  @ApiProperty({ enum: NOTIFICATION_CATEGORIES })
  @IsIn(NOTIFICATION_CATEGORIES as unknown as string[])
  category!: string;

  @ApiProperty()
  @IsBoolean()
  enabled!: boolean;
}
