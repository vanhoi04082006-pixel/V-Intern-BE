import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Public } from "../common/decorators/public.decorator";
import { RequirePermissions } from "../common/decorators/permissions.decorator";
import { GithubAuthService } from "./github-auth.service";
import { GithubRepositoriesService } from "./github-repositories.service";
import { GithubWebhookService } from './github-webhook.service';
import { PaginationQueryDto } from '../common/pagination/pagination-query.dto';
import { GithubRepositoryAccountService } from './github-repository-account.service';

const COOKIE = "vintern_github_state";
@ApiTags("github")
@ApiBearerAuth()
@Controller()
export class GithubController {
  constructor(
    private readonly auth: GithubAuthService,
    private readonly repos: GithubRepositoriesService,
    private readonly config: ConfigService,
    private readonly webhooks: GithubWebhookService,
    private readonly repositoryAccount: GithubRepositoryAccountService,
  ) {}
  private cookieOptions() {
    return {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: this.config.get("NODE_ENV") === "production",
      path: "/api/v1/github",
      maxAge: 600000,
    };
  }
  @Get("github/me") status(@CurrentUser("userId") userId: string) {
    return this.auth.status(userId);
  }
  @Get('github/repository-account')
  @RequirePermissions('settings.read')
  repositoryAccountStatus() { return this.repositoryAccount.status(); }

  @Post('github/repository-account')
  @RequirePermissions('settings.update')
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  selectRepositoryAccount(@CurrentUser('userId') userId: string) { return this.repositoryAccount.select(userId); }
  @Post("github/connect")
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async connect(
    @CurrentUser("userId") userId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.begin(userId);
    response.cookie(COOKIE, result.state, this.cookieOptions());
    return { authorizeUrl: result.authorizeUrl };
  }
  @Get("github/callback")
  @Public()
  async callback(
    @Query("code") code: string,
    @Query("state") state: string,
    @Query("error") error: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const cookies = request.cookies as Record<string, unknown> | undefined;
    const cookie = cookies?.[COOKIE];
    response.clearCookie(COOKIE, {
      httpOnly: true,
      sameSite: "lax",
      secure: this.config.get("NODE_ENV") === "production",
      path: "/api/v1/github",
    });
    if (
      error ||
      typeof code !== "string" ||
      code.length > 512 ||
      !code ||
      typeof state !== "string"
    )
      throw new BadRequestException(
        "Kết nối GitHub đã hủy hoặc callback không hợp lệ. Hãy quay lại ứng dụng và thử lại.",
      );
    const target = await this.auth.finish(
      code,
      state,
      typeof cookie === "string" ? cookie : "",
    );
    response.redirect(303, target);
  }
  @Delete("github/me") disconnect(@CurrentUser("userId") userId: string) {
    return this.auth.disconnect(userId);
  }
  @Get("sessions/:id/github") statusRepo(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser("userId") userId: string,
  ) {
    return this.repos.status(id, userId);
  }
  @Post("sessions/:id/github/provision")
  @RequirePermissions("sessions.manage")
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  provision(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser("userId") userId: string,
  ) {
    return this.repos.provision(id, userId);
  }
  @Post("sessions/:id/github/invite")
  @RequirePermissions("sessions.manage")
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  invite(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser("userId") userId: string,
  ) {
    return this.repos.invite(id, userId, true);
  }
  @Post('sessions/:id/github/webhook')
  @RequirePermissions('sessions.manage')
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  configureWebhook(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('userId') userId: string) {
    return this.repos.configureWebhook(id, userId);
  }
  @Get('sessions/:id/github/activity')
  async githubActivity(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('userId') userId: string, @Query() query: PaginationQueryDto) {
    await this.repos.status(id, userId);
    return this.webhooks.activity(id, query.page, query.pageSize);
  }
}
