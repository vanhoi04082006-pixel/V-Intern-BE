import { GithubEvidenceService } from "./github-evidence.service";
import { Module } from "@nestjs/common";
import { RbacModule } from "../rbac/rbac.module";
import { GithubAuthService } from "./github-auth.service";
import { GithubClient } from "./github-client";
import { GithubController } from "./github.controller";
import { GithubRepositoriesService } from "./github-repositories.service";
@Module({
  imports: [RbacModule],
  controllers: [GithubController],
  providers: [
    GithubEvidenceService,
    GithubAuthService,
    GithubClient,
    GithubRepositoriesService,
  ],
  exports: [
    GithubEvidenceService,
    GithubAuthService,
    GithubClient,
    GithubRepositoriesService,
  ],
})
export class GithubModule {}
