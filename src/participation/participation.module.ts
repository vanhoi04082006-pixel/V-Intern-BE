import { Module } from "@nestjs/common";
import { RbacModule } from "../rbac/rbac.module";
import { ParticipationController } from "./participation.controller";
import { ParticipationLedger } from "./participation-ledger.service";
import { ParticipationService } from "./participation.service";
import { ParticipationWorker } from "./participation.worker";
@Module({
  imports: [RbacModule],
  providers: [ParticipationLedger, ParticipationService, ParticipationWorker],
  controllers: [ParticipationController],
  exports: [ParticipationLedger, ParticipationService],
})
export class ParticipationModule {}
