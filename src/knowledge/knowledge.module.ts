import { Module } from '@nestjs/common';
import { CareerRolesModule } from '../career-roles/career-roles.module';
import { RbacModule } from '../rbac/rbac.module';
import { KnowledgeStore } from './knowledge.store';
import { KnowledgeController } from './knowledge.controller';
import { KnowledgeImportService } from './knowledge-import.service';
import { KnowledgeRetrievalService } from './knowledge-retrieval.service';

/** Authoring HTTP and internal server-scoped retrieval use separate permission boundaries. */
@Module({ imports: [RbacModule, CareerRolesModule], controllers: [KnowledgeController], providers: [KnowledgeStore, KnowledgeImportService, KnowledgeRetrievalService], exports: [KnowledgeStore, KnowledgeRetrievalService] })
export class KnowledgeModule {}
