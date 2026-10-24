import { GithubModule } from '../github/github.module';
import { CodeReviewModule } from '../code-review/code-review.module';
import { Module } from '@nestjs/common';
import { TasksModule } from '../tasks/tasks.module';
import { RbacModule } from '../rbac/rbac.module';
import { SubmissionsController } from './submissions.controller';
import { SubmissionsService } from './submissions.service';
import { ParticipationModule } from '../participation/participation.module';
@Module({ imports: [TasksModule, RbacModule, GithubModule, CodeReviewModule, ParticipationModule], controllers: [SubmissionsController], providers: [SubmissionsService] })
export class SubmissionsModule {}
