import { Module } from "@nestjs/common";
import { AgentStateStore } from "./runtime/agent-state.store";
import { AgentTelemetry } from "./runtime/agent-telemetry.service";
@Module({
  providers: [AgentStateStore, AgentTelemetry],
  exports: [AgentStateStore, AgentTelemetry],
})
export class AgentPersistenceModule {}
