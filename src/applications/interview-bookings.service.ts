import { ConflictException, Injectable } from "@nestjs/common";
import { hash } from "bcryptjs";
import { randomBytes, randomUUID } from "node:crypto";
import { DataSource, EntityManager } from "typeorm";
import { CommunicationsService } from "../communications/communications.service";
import { User } from "../users/entities/user.entity";
import { RecruitmentProfile } from "../recruitment/entities/recruitment-profile.entity";
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
        const roles = await em.query(
          "SELECT r.code FROM user_roles ur JOIN roles r ON r.id=ur.roleId WHERE ur.userId=@0",
          [user.id],
        );
        if (
          user.status !== "active" ||
          !roles.some((r: { code: string }) => r.code === "intern") ||
          roles.some((r: { code: string }) =>
            ["admin", "instructor"].includes(r.code),
          )
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
      const [booking] = await em.query(
        "SELECT * FROM interview_bookings WITH(UPDLOCK,HOLDLOCK) WHERE applicationId=@0 AND status='confirmed'",
        [applicationId],
      );
      if (!booking) throw new ConflictException("Chưa có lịch đang hiệu lực.");
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
}
