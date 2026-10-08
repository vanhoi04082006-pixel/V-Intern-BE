import { Module } from '@nestjs/common';
import { AssignmentsModule } from '../assignments/assignments.module';
import { AuditModule } from '../audit/audit.module';
import { RbacModule } from '../rbac/rbac.module';
import { TasksModule } from '../tasks/tasks.module';
import { RecruitmentModule } from '../recruitment/recruitment.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RecruitmentProfile } from '../recruitment/entities/recruitment-profile.entity';
import { InternController } from './intern.controller';
import { InternService } from './intern.service';
import { InternReadService } from './intern-read.service';
import { ProjectsModule } from '../projects/projects.module';
import { SprintsModule } from '../sprints/sprints.module';

/**
 * Phase 3 (spec 23): the intern workspace composes the assignment base
 * state with REAL sprint/task data from TasksModule (no fake metrics).
 */
@Module({
  imports: [
    AssignmentsModule,
    ProjectsModule,
    SprintsModule,
    AuditModule,
    RbacModule,
    TasksModule,
    RecruitmentModule,
    TypeOrmModule.forFeature([RecruitmentProfile]),
  ],
  controllers: [InternController],
  providers: [InternService, InternReadService],
})
export class InternModule {}
