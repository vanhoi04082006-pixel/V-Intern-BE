import {
  BadRequestException,
  ConflictException,
  Injectable,
} from "@nestjs/common";
import { hash } from "bcryptjs";
import { randomBytes, randomUUID } from "node:crypto";
import { DataSource, EntityManager } from "typeorm";
import { CommunicationsService } from "../communications/communications.service";
import { User } from "../users/entities/user.entity";
import { PermissionsService } from "../rbac/permissions.service";
import { RecruitmentProfile } from "../recruitment/entities/recruitment-profile.entity";
import { RecruitmentService } from "../recruitment/recruitment.service";
import { computeAttemptGate } from "../recruitment/attempt-policy";
import { canTransitionRecruitmentProfile } from "../recruitment/recruitment-status.machine";
import { AuditLog } from "../audit/entities/audit-log.entity";
import { AvailableSlot, RecruitingRole } from "./intake-agents.service";
import { RecruitmentRoundsService } from "./recruitment-rounds.service";
import {
  ApplicationsService,
  CandidateApplication,
} from "./applications.service";
@Injectable()
export class InterviewBookingsService {
  constructor(
    private readonly db: DataSource,
    private readonly mail: CommunicationsService,
    private readonly rounds: RecruitmentRoundsService,
    private readonly apps: ApplicationsService,
    private readonly recruitment: RecruitmentService,
    private readonly permissions: PermissionsService,
  ) {}
  async recruitingRoles(roundId: string): Promise<RecruitingRole[]> {
    const roles: RecruitingRole[] = await this.db.query(
      "SELECT c.code,c.name,c.description,c.requiredSkillsJson FROM career_roles c WHERE c.status='published' AND c.acceptingApplications=1 AND EXISTS(SELECT 1 FROM interview_slots s WHERE s.roundId=@0 AND s.roleCode=c.code AND s.status='open' AND s.startsAt>SYSUTCDATETIME())",
      [roundId],
    );
    const ready = [];
    for (const role of roles) {
      try {
        await this.rounds.readiness(role.code);
        ready.push(role);
      } catch (e) {
        if (e instanceof Error && "getStatus" in e) continue;
        throw e;
      }
    }
    return ready;
  }
  async available(roundId: string, role: string): Promise<AvailableSlot[]> {
    return this.db.query(
      `SELECT TOP(30) s.* FROM interview_slots s JOIN recruitment_rounds r ON r.id=s.roundId JOIN career_roles c ON c.code=s.roleCode
      WHERE s.roundId=@0 AND s.roleCode=@1 AND s.status='open' AND r.status<>'closed' AND c.status='published' AND c.acceptingApplications=1
      AND s.startsAt>=DATEADD(minute,s.minimumPreparationMinutes,SYSUTCDATETIME())
      AND (SELECT COUNT(*) FROM interview_bookings b WHERE b.slotId=s.id AND b.status='confirmed')<s.capacity ORDER BY s.startsAt,s.id`,
      [roundId, role],
    );
  }
  async reserve(
    actor: string,
    applicationId: string,
    slotId: string,
    lease: string | null = null,
  ) {
    // Password bytes never enter Agent inputs, audit detail or API return values.
    const password = randomBytes(24).toString("base64url"),
      passwordHash = await hash(password, 10);
    return this.db.transaction(async (em) => {
      const [application]: CandidateApplication[] = await em.query(
        "SELECT * FROM cv_applications WITH(UPDLOCK,HOLDLOCK) WHERE id=@0 AND verifiedAt IS NOT NULL",
        [applicationId],
      );
      if (!application)
        throw new ConflictException("Hồ sơ chưa xác minh email.");
      await this.rounds.authorize(actor, application.roundId, em);
      const [existing] = await em.query(
        "SELECT id,slotId FROM interview_bookings WHERE applicationId=@0 AND status='confirmed'",
        [applicationId],
      );
      if (existing) return { id: existing.id, booked: true, duplicate: true };
      if (
        lease &&
        !(
          await em.query(
            "SELECT id FROM cv_applications WHERE id=@0 AND leaseToken=@1 AND status='analyzing' AND leaseUntil>SYSUTCDATETIME()",
            [applicationId, lease],
          )
        ).length
      )
        throw new ConflictException("APPLICATION_LEASE_LOST");
      if (["cancelled", "deferred", "unverified"].includes(application.status))
        throw new ConflictException("Hồ sơ không thể đặt lịch.");
      const [slot] = await em.query(
        `SELECT s.* FROM interview_slots s WITH(UPDLOCK,HOLDLOCK) JOIN recruitment_rounds r ON r.id=s.roundId
        WHERE s.id=@0 AND s.roundId=@1 AND s.roleCode=@2 AND s.status='open' AND r.status<>'closed' AND s.startsAt>=DATEADD(minute,s.minimumPreparationMinutes,SYSUTCDATETIME())`,
        [slotId, application.roundId, application.matchedRole],
      );
      if (!slot) return { booked: false };
      await this.rounds.readiness(slot.roleCode, em);
      const [capacity] = await em.query(
        "SELECT COUNT(*) n FROM interview_bookings WITH(UPDLOCK,HOLDLOCK) WHERE slotId=@0 AND status='confirmed'",
        [slotId],
      );
      if (capacity.n >= slot.capacity) return { booked: false };
      const [identity] = await em.query(
        "SELECT id FROM users WITH(UPDLOCK,HOLDLOCK) WHERE email=@0",
        [application.email],
      );
      let user = identity
        ? await em.getRepository(User).findOneByOrFail({ id: identity.id })
        : null;
      const isNew = !user;
      if (user) {
        const access = await this.permissions.accessSnapshot(user.id);
        if (
          user.status !== "active" ||
          !access.roles.has("intern") ||
          access.roles.has("admin") ||
          access.roles.has("instructor")
        )
          throw new ConflictException({
            code: "EXISTING_ACCOUNT_REQUIRES_REVIEW",
            message:
              "Tài khoản hiện có cần người phụ trách kiểm tra; mật khẩu được giữ nguyên.",
          });
      } else {
        user = await em.getRepository(User).save({
          email: application.email,
          username: `cv_${randomUUID()}`,
          displayName: application.fullName,
          status: "active",
          passwordHash,
          mustChangePassword: true,
          temporaryPasswordExpiresAt: new Date(
            slot.endsAt.getTime() + 86400000,
          ),
        });
        await em.query(
          "INSERT INTO user_roles(userId,roleId) SELECT @0,id FROM roles WHERE code='intern'",
          [user.id],
        );
      }
      let profile = await em
        .getRepository(RecruitmentProfile)
        .findOneBy({ userId: user.id });
      if (
        profile &&
        (profile.attemptCount >= 3 ||
          ["passed", "interview_in_progress", "evaluation_pending"].includes(
            profile.status,
          ))
      )
        throw new ConflictException({
          code: "RECRUITMENT_NOT_ELIGIBLE",
          message:
            "Tài khoản đã đạt, đang phỏng vấn hoặc đã hết 3 lượt. Không tự đặt lại lượt.",
        });
      if (!profile)
        profile = em
          .getRepository(RecruitmentProfile)
          .create({ userId: user.id, attemptCount: 0 });
      profile.selectedRole = slot.roleCode;
      profile.status = "role_selected";
      await em.getRepository(RecruitmentProfile).save(profile);
      const bookingId = randomUUID();
      await em.query(
        "IF EXISTS(SELECT 1 FROM interview_bookings WHERE applicationId=@1) UPDATE interview_bookings SET slotId=@2,status='confirmed',version=version+1 WHERE applicationId=@1 ELSE INSERT INTO interview_bookings(id,applicationId,slotId) VALUES(@0,@1,@2)",
        [bookingId, applicationId, slotId],
      );
      const [booking] = await em.query(
        "SELECT id,version FROM interview_bookings WHERE applicationId=@0",
        [applicationId],
      );
      await em.query(
        "UPDATE cv_applications SET status='booked',userId=@1,leaseToken=NULL,leaseUntil=NULL,lastCode=NULL,updatedAt=SYSUTCDATETIME() WHERE id=@0",
        [applicationId, user.id],
      );
      await this.scheduleMail(em, application, booking, slot);
      const now = new Date(),
        credentialsAt = new Date(
          slot.startsAt.getTime() - slot.credentialsLeadMinutes * 60000,
        );
      await this.mail.enqueue(
        {
          eventKey: `booking:${booking.id}:${booking.version}:credentials`,
          ownerId: actor,
          to: application.email,
          sensitive: isNew,
          availableAt: credentialsAt > now ? credentialsAt : now,
          expiresAt: slot.endsAt,
          content: {
            kind: isNew ? "credentials" : "existing-account",
            name: application.fullName,
            ctaPath: "/login",
            ...(isNew ? { username: application.email, password } : {}),
          },
        },
        em,
      );
      await this.apps.event(
        em,
        applicationId,
        "booked",
        "Đã xác nhận lịch. Email lịch hẹn và thông tin đăng nhập được gửi riêng theo mốc giờ.",
      );
      return { id: booking.id, booked: true, duplicate: false };
    });
  }
  private async scheduleMail(
    em: EntityManager,
    application: CandidateApplication,
    booking: { id: string; version: number },
    slot: AvailableSlot & { roleCode?: string },
  ) {
    const [role] = await em.query(
      "SELECT name FROM career_roles WHERE code=@0",
      [slot.roleCode ?? application.matchedRole],
    );
    const when = `${new Intl.DateTimeFormat("vi-VN", { dateStyle: "full", timeStyle: "short", timeZone: slot.timezone }).format(slot.startsAt)} · ${slot.timezone}`;
    await this.mail.enqueue(
      {
        eventKey: `booking:${booking.id}:${booking.version}:schedule`,
        to: application.email,
        content: {
          kind: "schedule",
          name: application.fullName,
          role: role.name,
          when,
          ctaPath: "/login",
        },
        availableAt: new Date(),
        expiresAt: slot.startsAt,
      },
      em,
    );
  }
  async cancel(actor: string, roundId: string, applicationId: string) {
    await this.apps.staffApplication(actor, roundId, applicationId);
    return this.db.transaction(async (em) => {
      await em.query(
        "SELECT id FROM cv_applications WITH(UPDLOCK,HOLDLOCK) WHERE id=@0",
        [applicationId],
      );
      const [booking] = await em.query(
        "SELECT id FROM interview_bookings WITH(UPDLOCK,HOLDLOCK) WHERE applicationId=@0",
        [applicationId],
      );
      if (booking) {
        await this.assertNoSending(em, booking.id);
        await em.query(
          "UPDATE mail_outbox SET status='cancelled',sealedPayload=NULL WHERE eventKey LIKE @0 AND status IN('pending','uncertain','dead')",
          [`booking:${booking.id}:%`],
        );
        await em.query(
          "UPDATE interview_bookings SET status='cancelled',version=version+1 WHERE id=@0",
          [booking.id],
        );
      }
      await em.query(
        "UPDATE cv_applications SET status='cancelled',leaseToken=NULL,leaseUntil=NULL WHERE id=@0",
        [applicationId],
      );
      await this.apps.event(
        em,
        applicationId,
        "cancelled",
        "Người phụ trách đã hủy hồ sơ/lịch. Email chưa gửi của lịch cũ đã được vô hiệu.",
      );
      return { cancelled: true };
    });
  }
  async resendCredentials(
    actor: string,
    roundId: string,
    applicationId: string,
    acknowledgeUncertain: boolean,
  ) {
    await this.apps.staffApplication(actor, roundId, applicationId);
    const [job] = await this.db.query(
      "SELECT m.id FROM interview_bookings b JOIN mail_outbox m ON m.eventKey=CONCAT('booking:',CONVERT(varchar(36),b.id),':',b.version,':credentials') WHERE b.applicationId=@0 AND b.status='confirmed'",
      [applicationId],
    );
    if (!job)
      throw new ConflictException(
        "Không có email đăng nhập của lịch hiện hành.",
      );
    return this.mail.resendCredentialFromDomain(job.id, acknowledgeUncertain);
  }
  private async assertNoSending(em: EntityManager, bookingId: string) {
    const active = await em.query(
      "SELECT id FROM mail_outbox WITH(UPDLOCK,HOLDLOCK) WHERE eventKey LIKE @0 AND status='sending'",
      [`booking:${bookingId}:%`],
    );
    if (active.length)
      throw new ConflictException(
        "Email đang được gửi. Chờ kết quả rồi đổi/hủy lịch để tránh email cũ đến sau khi đổi lịch.",
      );
  }
  async reschedule(
    actor: string,
    roundId: string,
    applicationId: string,
    slotId: string,
  ) {
    const app = await this.apps.staffApplication(actor, roundId, applicationId);
    return this.db.transaction(async (em) => {
      await em.query(
        "SELECT id FROM cv_applications WITH(UPDLOCK,HOLDLOCK) WHERE id=@0",
        [applicationId],
      );
      const [profile] = await em.query(
        "SELECT currentInterviewSessionId FROM recruitment_profiles WITH(UPDLOCK,HOLDLOCK) WHERE userId=@0",
        [app.userId],
      );
      const [booking] = await em.query(
        "SELECT * FROM interview_bookings WITH(UPDLOCK,HOLDLOCK) WHERE applicationId=@0 AND status='confirmed'",
        [applicationId],
      );
      if (!booking) throw new ConflictException("Chưa có lịch đang hiệu lực.");
      const consumed = await em.query(
        "SELECT bookingId FROM interview_admissions WHERE bookingId=@0 AND bookingVersion=@1",
        [booking.id, booking.version],
      );
      const started = profile?.currentInterviewSessionId
        ? await em.query(
            "SELECT id FROM interview_sessions WHERE id=@0 AND startedAt>=@1",
            [
              profile.currentInterviewSessionId,
              booking.createdAt.toISOString(),
            ],
          )
        : [];
      if (consumed.length || started.length)
        throw new ConflictException({
          code: "INTERVIEW_SCHEDULE_USED",
          message:
            "Lịch đã được sử dụng. Dùng chức năng hẹn phỏng vấn lại có lý do để giữ lịch sử.",
        });
      if (booking.slotId.toLowerCase() === slotId.toLowerCase())
        return { rescheduled: true };
      await this.assertNoSending(em, booking.id);
      const [slot] = await em.query(
        "SELECT * FROM interview_slots WITH(UPDLOCK,HOLDLOCK) WHERE id=@0 AND roundId=@1 AND roleCode=@2 AND status='open' AND startsAt>=DATEADD(minute,minimumPreparationMinutes,SYSUTCDATETIME())",
        [slotId, roundId, app.matchedRole],
      );
      if (!slot) throw new ConflictException("Khung giờ mới không còn hợp lệ.");
      await this.rounds.readiness(slot.roleCode, em);
      const [used] = await em.query(
        "SELECT COUNT(*) n FROM interview_bookings WHERE slotId=@0 AND status='confirmed'",
        [slotId],
      );
      if (used.n >= slot.capacity)
        throw new ConflictException("Khung giờ đã đầy.");
      const [user] = await em.query(
        "SELECT mustChangePassword,temporaryPasswordExpiresAt FROM users WHERE id=@0",
        [app.userId],
      );
      if (
        user?.mustChangePassword &&
        (!user.temporaryPasswordExpiresAt ||
          user.temporaryPasswordExpiresAt <= slot.endsAt)
      )
        throw new ConflictException(
          "Ứng viên cần đổi mật khẩu tạm trước khi dời sang lịch này. Không tự thay mật khẩu.",
        );
      const newVersion = booking.version + 1;
      // Reuse the exact encrypted credential, without recovering or replacing the user's password.
      const moved = await em.query(
        `UPDATE mail_outbox SET eventKey=@1,availableAt=@2,expiresAt=@3 OUTPUT inserted.id WHERE eventKey=@0 AND status='pending' AND attempts=0`,
        [
          `booking:${booking.id}:${booking.version}:credentials`,
          `booking:${booking.id}:${newVersion}:credentials`,
          new Date(
            slot.startsAt.getTime() - slot.credentialsLeadMinutes * 60000,
          ).toISOString(),
          slot.endsAt.toISOString(),
        ],
      );
      await em.query(
        "UPDATE mail_outbox SET status='cancelled',sealedPayload=NULL WHERE eventKey LIKE @0 AND status IN('pending','uncertain','dead')",
        [`booking:${booking.id}:${booking.version}:%`],
      );
      await em.query(
        "UPDATE interview_bookings SET slotId=@1,version=@2 WHERE id=@0",
        [booking.id, slotId, newVersion],
      );
      await this.scheduleMail(
        em,
        app,
        { id: booking.id, version: newVersion },
        slot,
      );
      if (!moved.length)
        await this.mail.enqueue(
          {
            eventKey: `booking:${booking.id}:${newVersion}:credentials`,
            ownerId: actor,
            to: app.email,
            content: {
              kind: "existing-account",
              name: app.fullName,
              ctaPath: "/login",
            },
            availableAt: new Date(
              slot.startsAt.getTime() - slot.credentialsLeadMinutes * 60000,
            ),
            expiresAt: slot.endsAt,
          },
          em,
        );
      await this.apps.event(
        em,
        applicationId,
        "rescheduled",
        "Đã chuyển sang khung giờ mới. Lịch cũ và email chưa gửi của lịch cũ không còn hiệu lực.",
      );
      return { rescheduled: true };
    });
  }
  async retake(
    actor: string,
    roundId: string,
    applicationId: string,
    slotId: string,
    reason: string,
  ) {
    if (reason.trim().length < 10)
      throw new BadRequestException("Cần lý do rõ ràng, tối thiểu 10 ký tự.");
    await this.apps.staffApplication(actor, roundId, applicationId);
    return this.db.transaction(async (em) => {
      const [application]: CandidateApplication[] = await em.query(
        "SELECT * FROM cv_applications WITH(UPDLOCK,HOLDLOCK) WHERE id=@0 AND roundId=@1",
        [applicationId, roundId],
      );
      await this.rounds.authorize(actor, roundId, em);
      if (!application?.userId || !application.verifiedAt)
        throw new ConflictException(
          "Hồ sơ chưa có tài khoản và lịch đã xác minh.",
        );
      if (!["booked", "deferred"].includes(application.status))
        throw new ConflictException({
          code: "APPLICATION_REBOOK_NOT_ALLOWED",
          message:
            "Hồ sơ đã hủy hoặc không ở trạng thái được hẹn lại. Không khôi phục ngầm hồ sơ đã đóng.",
        });
      const profile = await em
        .getRepository(RecruitmentProfile)
        .createQueryBuilder("p")
        .setLock("pessimistic_write")
        .where("p.userId=:userId", { userId: application.userId })
        .getOne();
      if (!profile || profile.status === "passed")
        throw new ConflictException({
          code: "RECRUITMENT_ALREADY_PASSED",
          message:
            "Không được hẹn lại cho tài khoản đã đạt hoặc thiếu hồ sơ tuyển dụng.",
        });
      const limits = this.recruitment.attemptConfig();
      if (profile.attemptCount >= limits.maxAttempts)
        throw new ConflictException({
          code: "INTERVIEW_ATTEMPT_LIMIT",
          message: "Tài khoản đã hết lượt phỏng vấn. Không đặt lại số lượt.",
        });
      const [booking] = await em.query(
        "SELECT * FROM interview_bookings WITH(UPDLOCK,HOLDLOCK) WHERE applicationId=@0",
        [applicationId],
      );
      if (!booking) throw new ConflictException("Chưa có lịch để hẹn lại.");
      const consumed = await em.query(
        "SELECT bookingId FROM interview_admissions WHERE bookingId=@0 AND bookingVersion=@1",
        [booking.id, booking.version],
      );
      if (
        !consumed.length &&
        booking.status === "confirmed" &&
        booking.slotId.toLowerCase() === slotId.toLowerCase()
      )
        return { rebooked: true, version: booking.version, duplicate: true };
      const current = profile.currentInterviewSessionId
        ? await em.query(
            "SELECT status,startedAt FROM interview_sessions WHERE id=@0",
            [profile.currentInterviewSessionId],
          )
        : [];
      if (
        current[0] &&
        [
          "created",
          "in_progress",
          "submitted",
          "evaluating",
          "evaluation_failed",
        ].includes(current[0].status)
      )
        throw new ConflictException({
          code: "INTERVIEW_ALREADY_IN_PROGRESS",
          message: "Phiên hoặc đánh giá còn hoạt động; không tạo lượt mới.",
        });
      if (
        !consumed.length &&
        (!current[0]?.startedAt || current[0].startedAt < booking.createdAt)
      )
        throw new ConflictException({
          code: "INTERVIEW_RETAKE_NOT_REQUIRED",
          message:
            "Lịch hiện tại chưa được dùng. Dùng đổi lịch nếu cần chỉnh giờ.",
        });
      await this.assertNoSending(em, booking.id);
      const [slot] = await em.query(
        "SELECT s.* FROM interview_slots s WITH(UPDLOCK,HOLDLOCK) JOIN recruitment_rounds r ON r.id=s.roundId WHERE s.id=@0 AND s.roundId=@1 AND s.status='open' AND r.status<>'closed' AND s.startsAt>=DATEADD(minute,s.minimumPreparationMinutes,SYSUTCDATETIME())",
        [slotId, roundId],
      );
      if (!slot)
        throw new ConflictException(
          "Lịch mới cần đang mở và đủ thời gian chuẩn bị.",
        );
      if (
        profile.status !== "role_selected" &&
        !canTransitionRecruitmentProfile(profile.status, "role_selected")
      )
        throw new ConflictException({
          code: "INVALID_RECRUITMENT_TRANSITION",
          message: "Hồ sơ chưa ở trạng thái được chuẩn bị lượt mới.",
        });
      const latest = await this.recruitment.latestResult(profile.id);
      const alternate =
        latest?.decision === "failed" &&
        latest.overallScore >= 50 &&
        latest.overallScore <= 70
          ? latest.recommendedRole
          : null;
      if (
        slot.roleCode !== application.matchedRole &&
        slot.roleCode !== alternate
      )
        throw new ConflictException({
          code: "RECRUITMENT_SCHEDULE_ROLE_LOCKED",
          message:
            "Chỉ hẹn cùng nghề hoặc nghề được đề xuất từ kết quả phỏng vấn đã lưu.",
        });
      const gate = computeAttemptGate(
        {
          profileStatus: profile.status,
          attemptCount: profile.attemptCount,
          lastFailedAt: await this.recruitment.latestFailedResultAt(profile.id),
        },
        limits,
        slot.startsAt,
      );
      if (!gate.allowed)
        throw new ConflictException({
          code: "INTERVIEW_RETAKE_COOLDOWN",
          message: "Lịch phải sau thời điểm được phép phỏng vấn lại.",
          details: { nextEligibleAt: gate.nextEligibleAt },
        });
      await this.rounds.readiness(slot.roleCode, em);
      const [used] = await em.query(
        "SELECT COUNT(*) n FROM interview_bookings WHERE slotId=@0 AND status='confirmed'",
        [slotId],
      );
      if (used.n >= slot.capacity)
        throw new ConflictException("Khung giờ đã đầy.");
      const [user] = await em.query(
        "SELECT mustChangePassword,temporaryPasswordExpiresAt FROM users WHERE id=@0",
        [application.userId],
      );
      if (
        user.mustChangePassword &&
        (!user.temporaryPasswordExpiresAt ||
          user.temporaryPasswordExpiresAt <= slot.endsAt)
      )
        throw new ConflictException({
          code: "TEMPORARY_PASSWORD_RECOVERY_REQUIRED",
          message:
            "Cần khôi phục/đổi mật khẩu tạm trước lịch mới. Thao tác hẹn lại không đặt lại mật khẩu.",
        });
      await em.query(
        "UPDATE mail_outbox SET status='cancelled',sealedPayload=NULL WHERE eventKey LIKE @0 AND status IN('pending','uncertain','dead')",
        [`booking:${booking.id}:${booking.version}:%`],
      );
      const version = booking.version + 1;
      await em.query(
        "UPDATE interview_bookings SET status='confirmed',slotId=@1,version=@2 WHERE id=@0",
        [booking.id, slotId, version],
      );
      await em.query(
        "UPDATE cv_applications SET status='booked',matchedRole=@1,lastCode=NULL,updatedAt=SYSUTCDATETIME() WHERE id=@0",
        [applicationId, slot.roleCode],
      );
      await em.query(
        "UPDATE recruitment_profiles SET status='role_selected',selectedRole=@1,currentInterviewSessionId=NULL,updatedAt=SYSUTCDATETIME() WHERE id=@0",
        [profile.id, slot.roleCode],
      );
      await this.scheduleMail(
        em,
        application,
        { id: booking.id, version },
        slot,
      );
      await this.mail.enqueue(
        {
          eventKey: `booking:${booking.id}:${version}:credentials`,
          ownerId: actor,
          to: application.email,
          content: {
            kind: "existing-account",
            name: application.fullName,
            ctaPath: "/login",
          },
          availableAt: new Date(
            slot.startsAt.getTime() - slot.credentialsLeadMinutes * 60000,
          ),
          expiresAt: slot.endsAt,
        },
        em,
      );
      await this.apps.event(
        em,
        applicationId,
        "interview_rebooked",
        "Giảng viên đã hẹn lại phỏng vấn. Mật khẩu và số lượt đã sử dụng được giữ nguyên.",
      );
      await em.insert(AuditLog, {
        actorId: actor,
        action: "interview.rebooked",
        targetType: "cv_application",
        targetId: applicationId,
        detail: JSON.stringify({
          reason: reason.trim(),
          bookingId: booking.id,
          previousVersion: booking.version,
          version,
          slotId,
          roleCode: slot.roleCode,
          attemptCount: profile.attemptCount,
          previousProfileStatus: profile.status,
          nextProfileStatus: "role_selected",
          previousSessionId: profile.currentInterviewSessionId,
        }),
      });
      return { rebooked: true, version };
    });
  }
}
