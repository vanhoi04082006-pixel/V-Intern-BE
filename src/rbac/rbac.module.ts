import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Role } from './entities/role.entity';
import { Permission } from './entities/permission.entity';
import { UserRole } from './entities/user-role.entity';
import { RolePermission } from './entities/role-permission.entity';
import { GroupMember } from '../groups/entities/group-member.entity';
import { GroupRole } from '../groups/entities/group-role.entity';
import { RbacController } from './rbac.controller';
import { PermissionsService } from './permissions.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Role, Permission, UserRole, RolePermission, GroupMember, GroupRole]),
  ],
  controllers: [RbacController],
  providers: [PermissionsService],
  exports: [PermissionsService],
})
export class RbacModule {}
