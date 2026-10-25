import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from "@nestjs/common";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RequirePermissions } from "../common/decorators/permissions.decorator";
import { ReplacementPreviewService } from "./replacement-preview.service";
import { ReplacementCommandsService } from "./replacement-commands.service";
import {
  ReplacementApprovalDto,
  ReplacementPreviewDto,
} from "./replacement.dto";
@Controller()
export class ReplacementController {
  constructor(
    private readonly previews: ReplacementPreviewService,
    private readonly commands: ReplacementCommandsService,
  ) {}
  @Post("sessions/:id/participation/incidents/:incidentId/replacement-preview")
  @RequirePermissions(
    "sessions.manage",
    "recruitment.view",
    "assignments.manage",
  )
  prepare(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("incidentId", ParseUUIDPipe) incidentId: string,
    @CurrentUser("userId") actorId: string,
    @Body() input: ReplacementPreviewDto,
  ) {
    return this.previews.prepare(id, incidentId, actorId, input);
  }
  @Get("sessions/:id/participation/replacements/:commandId")
  @RequirePermissions(
    "sessions.manage",
    "recruitment.view",
    "assignments.manage",
  )
  get(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("commandId", ParseUUIDPipe) commandId: string,
    @CurrentUser("userId") actorId: string,
  ) {
    return this.previews.get(id, commandId, actorId);
  }
  @Post("sessions/:id/participation/replacements/:commandId/approve")
  @RequirePermissions(
    "sessions.manage",
    "recruitment.view",
    "assignments.manage",
  )
  approve(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("commandId", ParseUUIDPipe) commandId: string,
    @CurrentUser("userId") actorId: string,
    @Body() input: ReplacementApprovalDto,
  ) {
    return this.commands.approve(id, commandId, actorId, input);
  }
  @Get("participation/me/replacements")
  own(@CurrentUser("userId") actorId: string) {
    return this.previews.ownHistory(actorId);
  }
}
