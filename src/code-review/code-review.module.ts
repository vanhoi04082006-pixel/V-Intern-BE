import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module";
import { GithubModule } from "../github/github.module";
import { RbacModule } from "../rbac/rbac.module";
import { TasksModule } from "../tasks/tasks.module";
import { CodeReviewController } from "./code-review.controller";
import { CodeReviewService } from "./code-review.service";
import { GradingRunnerService } from "./grading-runner.service";
@Module({
  imports: [AiModule, GithubModule, RbacModule, TasksModule],
  controllers: [CodeReviewController],
  providers: [CodeReviewService, GradingRunnerService],
  exports: [CodeReviewService],
})
export class CodeReviewModule {}
