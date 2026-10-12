import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { Role } from '../rbac/entities/role.entity';
import { RbacModule } from '../rbac/rbac.module';
import { User } from '../users/entities/user.entity';
import { GroupMember } from './entities/group-member.entity';
import { GroupRole } from './entities/group-role.entity';
import { UserGroup } from './entities/user-group.entity';
import { GroupsController } from './groups.controller';
import { GroupsService } from './groups.service';

@Module({
  imports: [TypeOrmModule.forFeature([UserGroup, GroupMember, GroupRole, User, Role]), AuditModule, RbacModule],
  controllers: [GroupsController],
  providers: [GroupsService],
  exports: [GroupsService],
})
export class GroupsModule {}
