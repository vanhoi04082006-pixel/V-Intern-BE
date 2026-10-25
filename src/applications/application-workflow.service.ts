import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";
import { DataSource } from "typeorm";
import { ApplicationsService } from "./applications.service";
import { IntakeAgents } from "./intake-agents.service";
import { InterviewBookingsService } from "./interview-bookings.service";
@Injectable()
export class ApplicationWorkflow
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private readonly logger = new Logger(ApplicationWorkflow.name);
  constructor(
    private readonly db: DataSource,
    private readonly config: ConfigService,
    private readonly apps: ApplicationsService,
    private readonly agents: IntakeAgents,
    private readonly bookings: InterviewBookingsService,
  ) {}
  onApplicationBootstrap() {
    if (
      this.config.get("APPLICATION_WORKER_ENABLED", "false") !== "true" ||
      this.config.get("NODE_ENV") === "test"
    )
      return;
    this.timer = setInterval(
      () =>
        void this.tick().catch(() =>
          this.logger.error("APPLICATION_WORKER_FAILED"),
        ),
      10000,
    );
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  async retry(actor: string, roundId: string, id: string) {
    await this.apps.staffApplication(actor, roundId, id);
    await this.db.query(
      "UPDATE cv_applications SET status='queued',lastCode=NULL,processingAttempt=processingAttempt+1 WHERE id=@0 AND status IN('failed','waitlisted')",
      [id],
    );
    return { queued: true };
  }
  async tick() {
    if (this.running) return 0;
    this.running = true;
    const lease = randomUUID();
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    try {
      const [app] = await this.db.query(
        `;WITH due AS(SELECT TOP(1) * FROM cv_applications WITH(UPDLOCK,ROWLOCK) WHERE verifiedAt IS NOT NULL AND (status='queued' OR status='analyzing' AND leaseUntil<=SYSUTCDATETIME()) ORDER BY createdAt)
        UPDATE due SET status='analyzing',leaseToken=@0,leaseUntil=DATEADD(second,90,SYSUTCDATETIME()) OUTPUT inserted.*`,
        [lease],
      );
      if (!app) return 0;
      heartbeat = setInterval(() => {
        void this.db
          .query(
            "UPDATE cv_applications SET leaseUntil=DATEADD(second,90,SYSUTCDATETIME()) WHERE id=@0 AND leaseToken=@1",
            [app.id, lease],
          )
          .catch(() => undefined);
      }, 15000);
      heartbeat.unref();
      try {
        const [round] = await this.db.query(
          "SELECT ownerId FROM recruitment_rounds WHERE id=@0 AND status<>'closed'",
          [app.roundId],
        );
        if (!round) throw Error("ROUND_CLOSED");
        const roles = await this.bookings.recruitingRoles(app.roundId);
        if (!roles.length)
          return await this.finish(
            app.id,
            lease,
            "waitlisted",
            "Chưa có nghề đang tuyển đủ điều kiện. Hồ sơ được giữ trong danh sách chờ.",
          );
        const facts = await this.agents.analyze(
          round.ownerId,
          app.id,
          app.revision,
          JSON.parse(app.segmentsJson ?? "[]"),
          app.processingAttempt,
        );
        const factsSaved = await this.db.query(
          "UPDATE cv_applications SET factsJson=@2 OUTPUT inserted.id WHERE id=@0 AND leaseToken=@1 AND status='analyzing'",
          [app.id, lease, JSON.stringify(facts)],
        );
        if (!factsSaved.length) return 0;
        if (!facts.facts.length || facts.confidence < 0.5)
          return await this.finish(
            app.id,
            lease,
            "needs_information",
            "CV chưa có đủ bằng chứng đáng tin cậy để chọn nghề. Vui lòng bổ sung CV.",
          );
        const match = await this.agents.match(
          round.ownerId,
          app.id,
          app.revision,
          facts,
          roles,
          app.processingAttempt,
        );
        await this.db.query(
          "UPDATE cv_applications SET matchJson=@2 WHERE id=@0 AND leaseToken=@1 AND status='analyzing'",
          [app.id, lease, JSON.stringify(match)],
        );
        if (!match.roleCode || match.confidence < 0.5)
          return await this.finish(
            app.id,
            lease,
            "needs_information",
            "Chưa tìm được nghề phù hợp với bằng chứng trong CV. Vui lòng bổ sung thông tin.",
          );
        const updated = await this.db.query(
          "UPDATE cv_applications SET factsJson=@2,matchJson=@3,matchedRole=@4 OUTPUT inserted.id WHERE id=@0 AND leaseToken=@1 AND status='analyzing'",
          [
            app.id,
            lease,
            JSON.stringify(facts),
            JSON.stringify(match),
            match.roleCode,
          ],
        );
        if (!updated.length) return 0;
        const slots = await this.bookings.available(
          app.roundId,
          match.roleCode,
        );
        if (!slots.length)
          return await this.finish(
            app.id,
            lease,
            "waitlisted",
            "Nghề phù hợp đã được xác định; chưa còn chỗ đủ thời gian chuẩn bị.",
          );
        const choice = await this.agents.coordinate(
          round.ownerId,
          app.id,
          app.revision,
          match.roleCode,
          slots,
          app.processingAttempt,
        );
        if (
          !choice.slotId ||
          !(
            await this.bookings.reserve(
              round.ownerId,
              app.id,
              choice.slotId,
              lease,
            )
          ).booked
        )
          return await this.finish(
            app.id,
            lease,
            "waitlisted",
            "Khung giờ vừa hết chỗ hoặc không còn hợp lệ. Hồ sơ được đưa vào danh sách chờ.",
          );
        return 1;
      } catch (error) {
        const code =
          error instanceof Error &&
          "code" in error &&
          typeof error.code === "string" &&
          /^[A-Z_]{1,64}$/.test(error.code)
            ? error.code
            : "APPLICATION_PROCESSING_FAILED";
        await this.db.query(
          "UPDATE cv_applications SET status='failed',leaseToken=NULL,leaseUntil=NULL,lastCode=@2 WHERE id=@0 AND leaseToken=@1",
          [app.id, lease, code],
        );
        // Error messages may contain model/CV text. Persist only the allowlisted code.
        return 1;
      }
    } finally {
      if (heartbeat) clearInterval(heartbeat);
      this.running = false;
    }
  }
  private async finish(
    id: string,
    lease: string,
    status: string,
    message: string,
  ) {
    await this.db.transaction(async (em) => {
      const changed = await em.query(
        "UPDATE cv_applications SET status=@2,leaseToken=NULL,leaseUntil=NULL,updatedAt=SYSUTCDATETIME() OUTPUT inserted.id WHERE id=@0 AND leaseToken=@1",
        [id, lease, status],
      );
      if (changed.length) await this.apps.event(em, id, status, message);
    });
    return 1;
  }
}
