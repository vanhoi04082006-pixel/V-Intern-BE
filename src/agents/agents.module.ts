import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { RbacModule } from '../rbac/rbac.module';
import { AgentsController } from './agents.controller';
import { AgentRuntimeService } from './runtime/agent-runtime.service';
import { KnowledgeAgentTools } from './runtime/knowledge-agent.tools';
import { AgentPersistenceModule } from './persistence.module';
@Module({ imports: [AiModule, KnowledgeModule, RbacModule, AgentPersistenceModule], controllers: [AgentsController],
  providers: [AgentRuntimeService, KnowledgeAgentTools], exports: [AgentRuntimeService] })
export class AgentsModule {}
