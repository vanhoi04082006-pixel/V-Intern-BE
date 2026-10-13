import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { RbacModule } from '../rbac/rbac.module';
import { User } from '../users/entities/user.entity';
import { InternshipSession } from '../sessions/entities/internship-session.entity';
import { SessionInstructor } from '../sessions/entities/session-instructor.entity';
import { SessionMember } from '../sessions/entities/session-member.entity';
import { Project } from './entities/project.entity';
import { ProjectMember } from './entities/project-member.entity';
import { ProjectRoleSlot } from './entities/project-role-slot.entity';
import { ProjectTechnology } from './entities/project-technology.entity';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';

@Module({
  imports: [TypeOrmModule.forFeature([Project, ProjectMember, ProjectTechnology, ProjectRoleSlot, InternshipSession, SessionInstructor, SessionMember, User]), AuditModule, RbacModule],
  controllers: [ProjectsController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
