import { Module } from '@nestjs/common';
import { RbacModule } from '../rbac/rbac.module';
import { CareerRolesAdminController, CareerRolesCatalogController } from './career-roles.controller';
import { CareerRolesService } from './career-roles.service';

@Module({ imports: [RbacModule], controllers: [CareerRolesAdminController, CareerRolesCatalogController], providers: [CareerRolesService], exports: [CareerRolesService] })
export class CareerRolesModule {}
