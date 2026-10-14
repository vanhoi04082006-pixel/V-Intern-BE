import { Controller, Get, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RequestPrincipal } from "../common/types/request-principal";
import { CodeReviewService } from "./code-review.service";
@ApiTags("code review")
@ApiBearerAuth()
@Controller("submissions")
export class CodeReviewController {
  constructor(private readonly service: CodeReviewService) {}
  @Get(":id/code-reviews") list(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() principal: RequestPrincipal,
  ) {
    return this.service.list(id, principal);
  }
  @Post(":id/code-reviews")
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  run(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() principal: RequestPrincipal,
  ) {
    return this.service.run(id, principal);
  }
}
