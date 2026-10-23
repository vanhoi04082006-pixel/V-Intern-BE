import { Module } from '@nestjs/common';
import { CareerRolesModule } from '../career-roles/career-roles.module';
import { RbacModule } from '../rbac/rbac.module';
import { KnowledgeStore } from './knowledge.store';

/** Authoring storage only; controllers and publication are introduced by K02. */
@Module({ imports: [RbacModule, CareerRolesModule], providers: [KnowledgeStore], exports: [KnowledgeStore] })
export class KnowledgeModule {}
