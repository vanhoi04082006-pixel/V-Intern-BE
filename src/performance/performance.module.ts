import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Assignment } from '../assignments/entities/assignment.entity';
import { Evaluation } from '../evaluation/entities/evaluation.entity';
import { Project } from '../projects/entities/project.entity';
import { RbacModule } from '../rbac/rbac.module';
import { SessionInstructor } from '../sessions/entities/session-instructor.entity';
import { Sprint } from '../sprints/entities/sprint.entity';
import { Task } from '../tasks/entities/task.entity';
import { TaskStatusHistory } from '../tasks/entities/task-status-history.entity';
import { User } from '../users/entities/user.entity';
import { PerformanceController, PerformanceInternController } from './performance.controller';
import { PerformanceService } from './performance.service';

/** Phase 5 — Performance read model (spec 16-21): deterministic, DB-facts only. */
@Module({
  imports: [
    RbacModule,
    TypeOrmModule.forFeature([
      Assignment,
      Task,
      TaskStatusHistory,
      Evaluation,
      Sprint,
      Project,
      SessionInstructor,
      User,
    ]),
  ],
  controllers: [PerformanceController, PerformanceInternController],
  providers: [PerformanceService],
  exports: [PerformanceService],
})
export class PerformanceModule {}
