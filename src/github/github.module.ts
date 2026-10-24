import { GithubEvidenceService } from "./github-evidence.service";
import { GithubWebhookService } from './github-webhook.service';
import { GithubWebhookController } from './github-webhook.controller';
import { Module } from "@nestjs/common";
import { RbacModule } from "../rbac/rbac.module";
import { GithubAuthService } from "./github-auth.service";
import { GithubClient } from "./github-client";
import { GithubController } from "./github.controller";
import { GithubRepositoriesService } from "./github-repositories.service";
import { GithubRepositoryAccountService } from './github-repository-account.service';
import { GithubRepositorySyncService } from './github-repository-sync.service';
import { GithubInvitationsService } from './github-invitations.service';
import { CommunicationsModule } from '../communications/communications.module';
@Module({
  imports: [RbacModule, CommunicationsModule],
  controllers: [GithubController, GithubWebhookController],
  providers: [
    GithubInvitationsService,
    GithubRepositorySyncService,
    GithubRepositoryAccountService,
    GithubEvidenceService,
    GithubAuthService,
    GithubClient,
    GithubRepositoriesService,
    GithubWebhookService,
  ],
  exports: [
    GithubRepositoryAccountService,
    GithubEvidenceService,
    GithubAuthService,
    GithubClient,
    GithubRepositoriesService,
    GithubWebhookService,
  ],
})
export class GithubModule {}
