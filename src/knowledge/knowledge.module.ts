import { Module } from '@nestjs/common';
import { CareerRolesModule } from '../career-roles/career-roles.module';
import { RbacModule } from '../rbac/rbac.module';
import { KnowledgeStore } from './knowledge.store';
import { KnowledgeController } from './knowledge.controller';
import { KnowledgeImportService } from './knowledge-import.service';

/** Authoring/publication only. Retrieval is a separate server-scoped capability. */
@Module({ imports: [RbacModule, CareerRolesModule], controllers: [KnowledgeController], providers: [KnowledgeStore, KnowledgeImportService], exports: [KnowledgeStore] })
export class KnowledgeModule {}
