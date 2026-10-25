import { Module } from "@nestjs/common";
import { RbacModule } from "../rbac/rbac.module";
import { ParticipationController } from "./participation.controller";
import { ParticipationLedger } from "./participation-ledger.service";
import { ParticipationService } from "./participation.service";
import { ParticipationWorker } from "./participation.worker";
import { ReplacementAdviceService } from "./replacement-advice.service";
import { RecruitmentModule } from "../recruitment/recruitment.module";
import { AiModule } from "../ai/ai.module";
import { ReplacementPreviewService } from "./replacement-preview.service";
import { ReplacementCommandsService } from "./replacement-commands.service";
import { ReplacementController } from "./replacement.controller";
@Module({
  imports: [RbacModule, RecruitmentModule, AiModule],
  providers: [
    ParticipationLedger,
    ParticipationService,
    ParticipationWorker,
    ReplacementAdviceService,
    ReplacementPreviewService,
    ReplacementCommandsService,
  ],
  controllers: [ParticipationController, ReplacementController],
  exports: [
    ParticipationLedger,
    ParticipationService,
    ReplacementAdviceService,
  ],
})
export class ParticipationModule {}
