import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { RbacModule } from '../rbac/rbac.module';
import { AiGenerationModule } from '../ai-generation/ai-generation.module';
import { User } from '../users/entities/user.entity';
import { InternshipSession } from './entities/internship-session.entity';
import { SessionInstructor } from './entities/session-instructor.entity';
import { SessionMember } from './entities/session-member.entity';
import { SessionMilestone } from './entities/session-milestone.entity';
import { SessionsController } from './sessions.controller';
import { SessionsService } from './sessions.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([InternshipSession, SessionMember, SessionInstructor, SessionMilestone, User]),
    AuditModule,
    RbacModule,
    AiGenerationModule,
  ],
  controllers: [SessionsController],
  providers: [SessionsService],
  exports: [SessionsService],
})
export class SessionsModule {}
