import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RequirePermissions } from "../common/decorators/permissions.decorator";
import { PaginationQueryDto } from "../common/pagination/pagination-query.dto";
import { DecideAccessDto, RequestAccessDto } from "./sharing.dto";
import { SharingService } from "./sharing.service";

@ApiTags("session sharing")
@ApiBearerAuth()
@RequirePermissions("sessions.view")
@Controller("session-sharing")
export class SharingController {
  constructor(private readonly service: SharingService) {}
  @Get() list(
    @CurrentUser("userId") actorId: string,
    @Query() q: PaginationQueryDto,
  ) {
    return this.service.list(actorId, q.page, q.pageSize);
  }
  @Post() request(
    @CurrentUser("userId") actorId: string,
    @Body() dto: RequestAccessDto,
  ) {
    return this.service.request(actorId, dto);
  }
  @Post(":id/decision") decide(
    @CurrentUser("userId") actorId: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: DecideAccessDto,
  ) {
    return this.service.decide(actorId, id, dto);
  }
  @Get(":id/snapshot") snapshot(
    @CurrentUser("userId") actorId: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Query() q: PaginationQueryDto,
  ) {
    return this.service.snapshot(actorId, id, q.page, q.pageSize);
  }
}
