import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { InternshipSession } from '../sessions/entities/internship-session.entity';
import { User } from '../users/entities/user.entity';
import { AcademicClass } from './entities/class.entity';
import { ClassMember } from './entities/class-member.entity';
import { ClassesController } from './classes.controller';
import { ClassesService } from './classes.service';

@Module({
  imports: [TypeOrmModule.forFeature([AcademicClass, ClassMember, User, InternshipSession]), AuditModule],
  controllers: [ClassesController],
  providers: [ClassesService],
  exports: [ClassesService],
})
export class ClassesModule {}
