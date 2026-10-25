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
import {RepositoryAccessQueue} from './repository-access.queue';
import {RepositoryAccessWorker} from './repository-access.worker';
import {RepositoryAccessController} from './repository-access.controller';
import {RepositoryAccessService} from './repository-access.service';
@Module({
  imports: [RbacModule, CommunicationsModule],
  controllers: [GithubController, GithubWebhookController, RepositoryAccessController],
  providers: [
    RepositoryAccessQueue,
    RepositoryAccessWorker,
    RepositoryAccessService,
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
    RepositoryAccessWorker,
    GithubRepositoryAccountService,
    GithubEvidenceService,
    GithubAuthService,
    GithubClient,
    GithubRepositoriesService,
    GithubWebhookService,
  ],
})
export class GithubModule {}
