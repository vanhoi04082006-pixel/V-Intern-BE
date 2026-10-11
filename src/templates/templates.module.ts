import { Module } from '@nestjs/common';
import { TasksModule } from '../tasks/tasks.module';
import { TemplatesController } from './templates.controller';
import { TemplatesService } from './templates.service';
@Module({ imports: [TasksModule],controllers: [TemplatesController],providers: [TemplatesService] })
export class TemplatesModule {}
