import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RequirePermissions } from "../common/decorators/permissions.decorator";
import { PaginationQueryDto } from "../common/pagination/pagination-query.dto";
import { participationAccess } from "./participation-access";
import { DataSource } from "typeorm";
import { PermissionsService } from "../rbac/permissions.service";
import {
  ParticipationExtensionDto,
  ParticipationPolicyDto,
  ParticipationResolveDto,
} from "./participation.dto";
import { ParticipationService } from "./participation.service";
import { ParticipationWorker } from "./participation.worker";
import { ReplacementAdviceService } from "./replacement-advice.service";
@Controller()
export class ParticipationController {
  constructor(
    private readonly service: ParticipationService,
    private readonly worker: ParticipationWorker,
    private readonly db: DataSource,
    private readonly permissions: PermissionsService,
    private readonly replacementAdvice: ReplacementAdviceService,
  ) {}
  @Get("participation/me")
  own(@CurrentUser("userId") userId: string, @Query() q: PaginationQueryDto) {
    return this.service.own(userId, q.page, q.pageSize);
  }
  @Get("sessions/:id/participation")
  @RequirePermissions("sessions.manage")
  report(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser("userId") actorId: string,
    @Query() q: PaginationQueryDto,
  ) {
    return this.service.report(id, actorId, q.page, q.pageSize);
  }
  @Post("sessions/:id/participation/policy")
  @RequirePermissions("sessions.manage")
  savePolicy(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser("userId") actorId: string,
    @Body() dto: ParticipationPolicyDto,
  ) {
    return this.service.savePolicy(id, actorId, dto);
  }
  @Post("sessions/:id/participation/incidents/:incidentId/resolve")
  @RequirePermissions("sessions.manage")
  resolve(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("incidentId", ParseUUIDPipe) incidentId: string,
    @CurrentUser("userId") actorId: string,
    @Body() dto: ParticipationResolveDto,
  ) {
    return this.service.resolve(id, incidentId, actorId, dto);
  }
  @Post("sessions/:id/participation/tasks/:taskId/extend")
  @RequirePermissions("sessions.manage")
  extend(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("taskId", ParseUUIDPipe) taskId: string,
    @CurrentUser("userId") actorId: string,
    @Body() dto: ParticipationExtensionDto,
  ) {
    return this.service.extend(id, taskId, actorId, dto);
  }
  @Post("sessions/:id/participation/refresh")
  @RequirePermissions("sessions.manage")
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  async refresh(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser("userId") actorId: string,
  ) {
    await participationAccess(this.db, this.permissions, id, actorId);
    return this.worker.tick(id);
  }

  @Post("sessions/:id/participation/incidents/:incidentId/replacement-advice")
  @RequirePermissions("sessions.manage", "recruitment.view")
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  adviseReplacement(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("incidentId", ParseUUIDPipe) incidentId: string,
    @CurrentUser("userId") actorId: string,
  ) {
    return this.replacementAdvice.generate(id, incidentId, actorId);
  }
}
