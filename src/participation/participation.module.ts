import { Module } from "@nestjs/common";
import { RbacModule } from "../rbac/rbac.module";
import { ParticipationController } from "./participation.controller";
import { ParticipationLedger } from "./participation-ledger.service";
import { ParticipationService } from "./participation.service";
import { ParticipationWorker } from "./participation.worker";
import { ReplacementAdviceService } from "./replacement-advice.service";
import { RecruitmentModule } from "../recruitment/recruitment.module";
import { AiModule } from "../ai/ai.module";
@Module({
  imports: [RbacModule, RecruitmentModule, AiModule],
  providers: [
    ParticipationLedger,
    ParticipationService,
    ParticipationWorker,
    ReplacementAdviceService,
  ],
  controllers: [ParticipationController],
  exports: [
    ParticipationLedger,
    ParticipationService,
    ReplacementAdviceService,
  ],
})
export class ParticipationModule {}
