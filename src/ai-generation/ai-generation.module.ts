import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiModule } from '../ai/ai.module';
import { AuditModule } from '../audit/audit.module';
import { Assignment } from '../assignments/entities/assignment.entity';
import { Project } from '../projects/entities/project.entity';
import { ProjectMember } from '../projects/entities/project-member.entity';
import { ProjectRoleSlot } from '../projects/entities/project-role-slot.entity';
import { RbacModule } from '../rbac/rbac.module';
import { InternshipSession } from '../sessions/entities/internship-session.entity';
import { Sprint } from '../sprints/entities/sprint.entity';
import { Task } from '../tasks/entities/task.entity';
import { User } from '../users/entities/user.entity';
import { AiGenerationBatch } from './entities/ai-generation-batch.entity';
import { AiGenerationController } from './ai-generation.controller';
import { AiGenerationService } from './ai-generation.service';

@Module({
  imports: [
    AiModule,
    AuditModule,
    RbacModule,
    TypeOrmModule.forFeature([
      Assignment,
      Project,
      ProjectMember,
      ProjectRoleSlot,
      InternshipSession,
      Sprint,
      Task,
      User,
      AiGenerationBatch,
    ]),
  ],
  controllers: [AiGenerationController],
  providers: [AiGenerationService],
  exports: [AiGenerationService],
})
export class AiGenerationModule {}
