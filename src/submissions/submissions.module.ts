import { Module } from '@nestjs/common';
import { TasksModule } from '../tasks/tasks.module';
import { RbacModule } from '../rbac/rbac.module';
import { SubmissionsController } from './submissions.controller';
import { SubmissionsService } from './submissions.service';
@Module({ imports: [TasksModule, RbacModule], controllers: [SubmissionsController], providers: [SubmissionsService] })
export class SubmissionsModule {}
