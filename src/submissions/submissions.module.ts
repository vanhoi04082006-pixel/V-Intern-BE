import { Module } from '@nestjs/common';
import { TasksModule } from '../tasks/tasks.module';
import { SubmissionsController } from './submissions.controller';
import { SubmissionsService } from './submissions.service';
@Module({ imports: [TasksModule], controllers: [SubmissionsController], providers: [SubmissionsService] })
export class SubmissionsModule {}
