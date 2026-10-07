import { Module } from '@nestjs/common';
import { AssignmentsModule } from '../assignments/assignments.module';
import { RbacModule } from '../rbac/rbac.module';
import { InternController } from './intern.controller';
import { InternService } from './intern.service';

@Module({
  imports: [AssignmentsModule, RbacModule],
  controllers: [InternController],
  providers: [InternService],
})
export class InternModule {}
