import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { Transform } from "class-transformer";
import { IsString, Matches, MaxLength, MinLength } from "class-validator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RequirePermissions } from "../common/decorators/permissions.decorator";
import { RepositoryAccessService } from "./repository-access.service";
class RepositoryAccessRetryDto {
  @IsString() @Matches(/^[a-f0-9]{64}$/) expectedRevision!: string;
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  )
  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  reason!: string;
}
@Controller()
export class RepositoryAccessController {
  constructor(private readonly service: RepositoryAccessService) {}
  @Get("sessions/:id/participation/repository-access-jobs")
  @RequirePermissions(
    "sessions.manage",
    "recruitment.view",
    "assignments.manage",
  )
  report(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser("userId") actorId: string,
  ) {
    return this.service.report(id, actorId);
  }
  @Post("sessions/:id/participation/repository-access-jobs/:jobId/retry")
  @RequirePermissions(
    "sessions.manage",
    "recruitment.view",
    "assignments.manage",
  )
  @Throttle({ default: { limit: 6, ttl: 60000 } })
  retry(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("jobId", ParseUUIDPipe) jobId: string,
    @CurrentUser("userId") actorId: string,
    @Body() body: RepositoryAccessRetryDto,
  ) {
    return this.service.retry(id, jobId, actorId, body);
  }
  @Get("github/me/repository-access")
  own(@CurrentUser("userId") actorId: string) {
    return this.service.own(actorId);
  }
}
