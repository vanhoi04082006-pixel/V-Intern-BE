import { Module } from '@nestjs/common';
import { CareerRolesModule } from '../career-roles/career-roles.module';
import { TasksModule } from '../tasks/tasks.module';
import { RbacModule } from '../rbac/rbac.module';
import { TemplatesController } from './templates.controller';
import { TemplatesService } from './templates.service';
@Module({ imports: [TasksModule, RbacModule, CareerRolesModule],controllers: [TemplatesController],providers: [TemplatesService], exports: [TemplatesService] })
export class TemplatesModule {}
