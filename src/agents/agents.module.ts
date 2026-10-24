import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { RbacModule } from '../rbac/rbac.module';
import { AgentsController } from './agents.controller';
import { AgentStateStore } from './runtime/agent-state.store';
import { AgentRuntimeService } from './runtime/agent-runtime.service';
import { AgentTelemetry } from './runtime/agent-telemetry.service';
import { KnowledgeAgentTools } from './runtime/knowledge-agent.tools';
@Module({ imports: [AiModule, KnowledgeModule, RbacModule], controllers: [AgentsController],
  providers: [AgentStateStore, AgentRuntimeService, AgentTelemetry, KnowledgeAgentTools], exports: [AgentRuntimeService] })
export class AgentsModule {}
