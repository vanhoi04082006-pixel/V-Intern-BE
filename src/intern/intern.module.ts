import { Module } from '@nestjs/common';
import { AssignmentsModule } from '../assignments/assignments.module';
import { RbacModule } from '../rbac/rbac.module';
import { TasksModule } from '../tasks/tasks.module';
import { RecruitmentModule } from '../recruitment/recruitment.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RecruitmentProfile } from '../recruitment/entities/recruitment-profile.entity';
import { InternController } from './intern.controller';
import { InternService } from './intern.service';

/**
 * Phase 3 (spec 23): the intern workspace composes the assignment base
 * state with REAL sprint/task data from TasksModule (no fake metrics).
 */
@Module({
  imports: [
    AssignmentsModule,
    RbacModule,
    TasksModule,
    RecruitmentModule,
    TypeOrmModule.forFeature([RecruitmentProfile]),
  ],
  controllers: [InternController],
  providers: [InternService],
})
export class InternModule {}
