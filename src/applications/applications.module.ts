import { Module } from "@nestjs/common";
import { CommunicationsModule } from "../communications/communications.module";
import { RbacModule } from "../rbac/rbac.module";
import { AiModule } from "../ai/ai.module";
import { RecruitmentModule } from "../recruitment/recruitment.module";
import { IntakeAgents } from "./intake-agents.service";
import { InterviewBookingsService } from "./interview-bookings.service";
import { ApplicationWorkflow } from "./application-workflow.service";
import {
  ApplicationsController,
  RecruitmentRoundsController,
} from "./applications.controller";
import { ApplicationsService } from "./applications.service";
import { CvStorage } from "./cv-storage";
import { RecruitmentRoundsService } from "./recruitment-rounds.service";
@Module({
  imports: [CommunicationsModule, RbacModule, AiModule, RecruitmentModule],
  controllers: [ApplicationsController, RecruitmentRoundsController],
  providers: [
    ApplicationsService,
    CvStorage,
    RecruitmentRoundsService,
    IntakeAgents,
    InterviewBookingsService,
    ApplicationWorkflow,
  ],
  exports: [ApplicationsService],
})
export class ApplicationsModule {}
