import { GithubEvidenceService } from "./github-evidence.service";
import { GithubWebhookService } from './github-webhook.service';
import { GithubWebhookController } from './github-webhook.controller';
import { Module } from "@nestjs/common";
import { RbacModule } from "../rbac/rbac.module";
import { GithubAuthService } from "./github-auth.service";
import { GithubClient } from "./github-client";
import { GithubController } from "./github.controller";
import { GithubRepositoriesService } from "./github-repositories.service";
@Module({
  imports: [RbacModule],
  controllers: [GithubController, GithubWebhookController],
  providers: [
    GithubEvidenceService,
    GithubAuthService,
    GithubClient,
    GithubRepositoriesService,
    GithubWebhookService,
  ],
  exports: [
    GithubEvidenceService,
    GithubAuthService,
    GithubClient,
    GithubRepositoriesService,
    GithubWebhookService,
  ],
})
export class GithubModule {}
