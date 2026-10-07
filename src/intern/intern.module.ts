import { Module } from '@nestjs/common';
import { AssignmentsModule } from '../assignments/assignments.module';
import { RbacModule } from '../rbac/rbac.module';
import { TasksModule } from '../tasks/tasks.module';
import { InternController } from './intern.controller';
import { InternService } from './intern.service';

/**
 * Phase 3 (spec 23): the intern workspace composes the assignment base
 * state with REAL sprint/task data from TasksModule (no fake metrics).
 */
@Module({
  imports: [AssignmentsModule, RbacModule, TasksModule],
  controllers: [InternController],
  providers: [InternService],
})
export class InternModule {}
