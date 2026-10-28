import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DataSource, EntityManager } from "typeorm";
import { AuditLog } from "../audit/entities/audit-log.entity";
import { ADMISSION_GRACE_MS, admissionWindow } from "./admission-window";

interface Application {
  id: string;
  userId: string;
  status: string;
}
interface Profile {
  currentInterviewSessionId: string | null;
}
interface Booking {
  id: string;
  version: number;
  status: string;
  slotId: string;
  roleCode: string;
  roleName: string;
  startsAt: Date;
  endsAt: Date;
  timezone: string;
  createdAt: Date;
  sessionId: string | null;
  noShowAt: Date | null;
}
export interface AdmissionEntry {
  application: Application;
  booking: Booking | null;
}

/** Server admission authority. All mutators lock CV → profile → booking, shared with start/retake. */
@Injectable()
export class InterviewAdmissionsService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private readonly logger = new Logger(InterviewAdmissionsService.name);
  constructor(
    private readonly db: DataSource,
    private readonly config: ConfigService,
  ) {}
  now() {
    return new Date();
  }
  async entry(
    em: EntityManager,
    userId: string,
    lock = false,
    applicationId?: string,
  ): Promise<AdmissionEntry | null> {
    const hint = lock ? "WITH(UPDLOCK,HOLDLOCK)" : "";
    const [application]: Application[] = await em.query(
      `SELECT TOP(1) id,userId,status FROM cv_applications ${hint} WHERE userId=@0 ${applicationId ? "AND id=@1" : ""} ORDER BY createdAt DESC,id DESC`,
      applicationId ? [userId, applicationId] : [userId],
    );
    if (!application) return null;
    const [profile]: Profile[] = await em.query(
      `SELECT currentInterviewSessionId FROM recruitment_profiles ${hint} WHERE userId=@0`,
      [userId],
    );
    const [booking]: Booking[] = await em.query(
      `SELECT b.id,b.version,b.status,b.slotId,b.createdAt,s.roleCode,c.name roleName,s.startsAt,s.endsAt,s.timezone,a.sessionId,a.noShowAt
      FROM interview_bookings b ${hint} JOIN interview_slots s ON s.id=b.slotId JOIN career_roles c ON c.code=s.roleCode
      LEFT JOIN interview_admissions a ON a.bookingId=b.id AND a.bookingVersion=b.version WHERE b.applicationId=@0`,
      [application.id],
    );
    // Preserve sessions that were genuinely started in G3 before the admission ledger existed.
    if (
      booking &&
      !booking.sessionId &&
      !booking.noShowAt &&
      profile?.currentInterviewSessionId
    ) {
      const [session] = await em.query(
        "SELECT i.id FROM interview_sessions i WHERE i.id=@0 AND i.userId=@1 AND i.roleCode=@2 AND i.startedAt>=@3 AND NOT EXISTS(SELECT 1 FROM interview_admissions x WHERE x.sessionId=i.id)",
        [
          profile.currentInterviewSessionId,
          userId,
          booking.roleCode,
          booking.createdAt.toISOString(),
        ],
      );
      if (session) booking.sessionId = session.id;
    }
    return { application, booking: booking ?? null };
  }
  phase(entry: AdmissionEntry, now = this.now()) {
    return entry.booking
      ? admissionWindow(
          {
            startsAt: entry.booking.startsAt,
            bookingStatus: entry.booking.status,
            applicationStatus: entry.application.status,
            sessionId: entry.booking.sessionId,
            noShowAt: entry.booking.noShowAt,
          },
          now,
        )
      : "cancelled";
  }
  async view(userId: string) {
    const entry = await this.entry(this.db.manager, userId);
    if (!entry) return null;
    const now = this.now(),
      b = entry.booking;
    return {
      managed: true as const,
      phase: this.phase(entry, now),
      bookingId: b?.id ?? null,
      version: b?.version ?? null,
      roleCode: b?.roleCode ?? null,
      roleName: b?.roleName ?? null,
      startsAt: b?.startsAt ?? null,
      endsAt: b?.endsAt ?? null,
      timezone: b?.timezone ?? null,
      deadlineAt: b
        ? new Date(b.startsAt.getTime() + ADMISSION_GRACE_MS)
        : null,
      sessionId: b?.sessionId ?? null,
      serverNow: now.toISOString(),
    };
  }
  async noShow(em: EntityManager, entry: AdmissionEntry, now: Date) {
    const b = entry.booking;
    if (!b || this.phase(entry, now) !== "no_show" || b.noShowAt) return false;
    await em.query(
      `INSERT INTO interview_admissions(bookingId,bookingVersion,applicationId,userId,slotId,roleCode,startsAt,endsAt,noShowAt)
      VALUES(@0,@1,@2,@3,@4,@5,@6,@7,@8)`,
      [
        b.id,
        b.version,
        entry.application.id,
        entry.application.userId,
        b.slotId,
        b.roleCode,
        b.startsAt.toISOString(),
        b.endsAt.toISOString(),
        now.toISOString(),
      ],
    );
    await em.query(
      "UPDATE interview_bookings SET status='cancelled' WHERE id=@0",
      [b.id],
    );
    await em.query(
      "UPDATE cv_applications SET status='deferred',lastCode='INTERVIEW_NO_SHOW',updatedAt=@1 WHERE id=@0",
      [entry.application.id, now.toISOString()],
    );
    await em.query(
      "UPDATE mail_outbox SET status='cancelled',sealedPayload=NULL WHERE eventKey LIKE @0 AND status IN('pending','uncertain','dead')",
      [`booking:${b.id}:${b.version}:%`],
    );
    await em.query(
      "INSERT INTO application_events(applicationId,kind,message) VALUES(@0,'no_show',@1)",
      [
        entry.application.id,
        "Đã quá 15 phút từ giờ hẹn và chưa bắt đầu. Hồ sơ chờ đợt tiếp theo; lịch sử và số lượt được giữ nguyên.",
      ],
    );
    await em.insert(AuditLog, {
      actorId: null,
      action: "interview.no_show",
      targetType: "cv_application",
      targetId: entry.application.id,
      detail: JSON.stringify({
        bookingId: b.id,
        version: b.version,
        deadlineAt: new Date(
          b.startsAt.getTime() + ADMISSION_GRACE_MS,
        ).toISOString(),
      }),
    });
    return true;
  }
  async admit(
    em: EntityManager,
    entry: AdmissionEntry | null,
    sessionId: string,
    now: Date,
  ) {
    const b = entry?.booking;
    if (!entry || !b) return;
    await em.query(
      `INSERT INTO interview_admissions(bookingId,bookingVersion,applicationId,userId,slotId,roleCode,startsAt,endsAt,sessionId,startedAt)
      VALUES(@0,@1,@2,@3,@4,@5,@6,@7,@8,@9)`,
      [
        b.id,
        b.version,
        entry.application.id,
        entry.application.userId,
        b.slotId,
        b.roleCode,
        b.startsAt.toISOString(),
        b.endsAt.toISOString(),
        sessionId,
        now.toISOString(),
      ],
    );
    await em.query(
      "INSERT INTO application_events(applicationId,kind,message) VALUES(@0,'interview_started',N'Đã bắt đầu phỏng vấn theo lịch. Tải lại trang sẽ tiếp tục cùng phiên, không tạo thêm lượt.')",
      [entry.application.id],
    );
  }
  async sweep(now = this.now()) {
    if (this.running) return 0;
    this.running = true;
    try {
      const rows: Array<{ userId: string; applicationId: string }> =
        await this.db.query(
          `SELECT TOP(100) a.userId,a.id applicationId FROM cv_applications a JOIN interview_bookings b ON b.applicationId=a.id JOIN interview_slots s ON s.id=b.slotId
        WHERE a.userId IS NOT NULL AND a.status='booked' AND b.status='confirmed' AND s.startsAt<=@0 AND NOT EXISTS(SELECT 1 FROM interview_admissions x WHERE x.bookingId=b.id AND x.bookingVersion=b.version)
        ORDER BY s.startsAt,a.id`,
          [new Date(now.getTime() - ADMISSION_GRACE_MS).toISOString()],
        );
      let count = 0;
      for (const row of rows)
        count += await this.db.transaction(async (em) => {
          const entry = await this.entry(
            em,
            row.userId,
            true,
            row.applicationId,
          );
          return entry && (await this.noShow(em, entry, now)) ? 1 : 0;
        });
      return count;
    } finally {
      this.running = false;
    }
  }
  onApplicationBootstrap() {
    if (
      this.config.get("NODE_ENV") === "test" ||
      this.config.get("APPLICATION_WORKER_ENABLED", "false") !== "true"
    )
      return;
    this.timer = setInterval(() => {
      void this.sweep().catch(() =>
        this.logger.error("INTERVIEW_ADMISSION_SWEEP_FAILED"),
      );
    }, 30000);
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
}
export type ScheduledInterview = Awaited<
  ReturnType<InterviewAdmissionsService["view"]>
>;
