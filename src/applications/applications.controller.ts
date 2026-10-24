import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Public } from "../common/decorators/public.decorator";
import { RequirePermissions } from "../common/decorators/permissions.decorator";
import {
  AccessRequestDto,
  ApplicationPageDto,
  ApplyDto,
  CreateRoundDto,
  CreateSlotDto,
  RoundStatusDto,
  VerifyApplicationDto,
  RescheduleDto,
  ResendCredentialsDto,
} from "./application.dto";
import { InterviewBookingsService } from "./interview-bookings.service";
import { ApplicationWorkflow } from "./application-workflow.service";
import { ApplicationsService } from "./applications.service";
import { RecruitmentRoundsService } from "./recruitment-rounds.service";
type Upload = { buffer: Buffer; mimetype: string; originalname: string };
const candidateCookie = "vintern_candidate";
const fileLimit = {
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
    fields: 8,
    fieldSize: 4096,
    parts: 10,
  },
};
@Public()
@Controller("applications")
export class ApplicationsController {
  constructor(
    private readonly apps: ApplicationsService,
    private readonly rounds: RecruitmentRoundsService,
  ) {}
  @Get("rounds") roundsList() {
    return this.rounds.publicRounds();
  }
  @Post()
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @UseInterceptors(FileInterceptor("cv", fileLimit))
  apply(@Body() dto: ApplyDto, @UploadedFile() file: Upload) {
    return this.apps.apply(dto, file);
  }
  @Post("request-access")
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  access(@Body() dto: AccessRequestDto) {
    return this.apps.requestAccess(dto.roundId, dto.email);
  }
  @Post("verify")
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async verify(
    @Body() dto: VerifyApplicationDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const capability = await this.apps.verify(dto.token);
    res.cookie(candidateCookie, capability, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/api/v1/applications",
      maxAge: 7 * 86400000,
    });
    res.setHeader("Cache-Control", "no-store");
    return { verified: true };
  }
  @Get("me") async me(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader("Cache-Control", "no-store");
    return this.apps.view(
      await this.apps.candidate(req.cookies?.[candidateCookie]),
    );
  }
  @Post("me/cv")
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @UseInterceptors(FileInterceptor("cv", fileLimit))
  async supplement(@Req() req: Request, @UploadedFile() file: Upload) {
    return this.apps.supplement(
      await this.apps.candidate(req.cookies?.[candidateCookie]),
      file,
    );
  }
  @Get("me/cv") async cv(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const cv = await this.apps.download(
      await this.apps.candidate(req.cookies?.[candidateCookie]),
    );
    res.setHeader("Cache-Control", "no-store");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="cv.${cv.format}"`,
    );
    res.setHeader("Content-Type", "application/octet-stream");
    return new StreamableFile(cv.bytes);
  }
}
@Controller("recruitment-rounds")
@RequirePermissions("applications.manage")
export class RecruitmentRoundsController {
  constructor(
    private readonly rounds: RecruitmentRoundsService,
    private readonly apps: ApplicationsService,
    private readonly bookings: InterviewBookingsService,
    private readonly workflow: ApplicationWorkflow,
  ) {}
  @Get() list(@CurrentUser("userId") actor: string) {
    return this.rounds.list(actor);
  }
  @Post() create(
    @CurrentUser("userId") actor: string,
    @Body() body: CreateRoundDto,
  ) {
    return this.rounds.create(actor, body);
  }
  @Get(":id") detail(
    @CurrentUser("userId") actor: string,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.rounds.detail(actor, id);
  }
  @Post(":id/status") status(
    @CurrentUser("userId") actor: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: RoundStatusDto,
  ) {
    return this.rounds.status(actor, id, body.status);
  }
  @Post(":id/slots") slot(
    @CurrentUser("userId") actor: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: CreateSlotDto,
  ) {
    return this.rounds.addSlot(actor, id, body);
  }
  @Post(":id/slots/:slotId/close") closeSlot(
    @CurrentUser("userId") actor: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("slotId", ParseUUIDPipe) slot: string,
  ) {
    return this.rounds.closeSlot(actor, id, slot);
  }
  @Get(":id/applications") applications(
    @CurrentUser("userId") actor: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Query() q: ApplicationPageDto,
  ) {
    return this.apps.listStaff(actor, id, q.page);
  }
  @Get(":id/applications/:applicationId") async application(
    @CurrentUser("userId") actor: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("applicationId", ParseUUIDPipe) app: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader("Cache-Control", "no-store");
    return this.apps.staffView(actor, id, app);
  }
  @Post(":id/applications/:applicationId/retry") retry(
    @CurrentUser("userId") actor: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("applicationId", ParseUUIDPipe) application: string,
  ) {
    return this.workflow.retry(actor, id, application);
  }
  @Post(":id/applications/:applicationId/cancel") cancel(
    @CurrentUser("userId") actor: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("applicationId", ParseUUIDPipe) application: string,
  ) {
    return this.bookings.cancel(actor, id, application);
  }
  @Post(":id/applications/:applicationId/reschedule") reschedule(
    @CurrentUser("userId") actor: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("applicationId", ParseUUIDPipe) application: string,
    @Body() dto: RescheduleDto,
  ) {
    return this.bookings.reschedule(actor, id, application, dto.slotId);
  }
  @Post(":id/applications/:applicationId/resend-credentials") resendCredentials(
    @CurrentUser("userId") actor: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("applicationId", ParseUUIDPipe) application: string,
    @Body() dto: ResendCredentialsDto,
  ) {
    return this.bookings.resendCredentials(
      actor,
      id,
      application,
      dto.acknowledgeUncertain,
    );
  }
  @Get(":id/applications/:applicationId/cv") async cv(
    @CurrentUser("userId") actor: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("applicationId", ParseUUIDPipe) app: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const cv = await this.apps.download(
      await this.apps.staffApplication(actor, id, app),
    );
    res.setHeader("Cache-Control", "no-store");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="cv.${cv.format}"`,
    );
    res.setHeader("Content-Type", "application/octet-stream");
    return new StreamableFile(cv.bytes);
  }
}
