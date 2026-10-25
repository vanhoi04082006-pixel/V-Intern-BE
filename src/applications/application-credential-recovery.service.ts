import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import { hash } from "bcryptjs";
import { DataSource, EntityManager } from "typeorm";
import { CommunicationsService } from "../communications/communications.service";
import { PermissionsService } from "../rbac/permissions.service";
import { AuditLog } from "../audit/entities/audit-log.entity";
import { RecruitmentRoundsService } from "./recruitment-rounds.service";
import { RecruitmentService } from "../recruitment/recruitment.service";

interface RecoveryInput {
  slotId: string;
  expectedRevision: string;
  reason: string;
}
interface Application {
  id: string;
  userId: string | null;
  email: string;
  fullName: string;
  status: string;
  matchedRole: string | null;
  verifiedAt: Date | null;
}
interface RecoveryUser {
  id: string;
  email: string;
  status: string;
  mustChangePassword: boolean;
  temporaryPasswordExpiresAt: Date | null;
  authVersion: number;
}
interface RecoveryProfile {
  status: string;
  attemptCount: number;
}
@Injectable()
export class ApplicationCredentialRecovery {
  constructor(
    private readonly db: DataSource,
    private readonly rounds: RecruitmentRoundsService,
    private readonly permissions: PermissionsService,
    private readonly mail: CommunicationsService,
    private readonly recruitment: RecruitmentService,
  ) {}
  private async application(
    em: EntityManager,
    actor: string,
    roundId: string,
    id: string,
  ) {
    await this.rounds.authorize(actor, roundId, em);
    const [application]: Application[] = await em.query(
      "SELECT * FROM cv_applications WITH(UPDLOCK,HOLDLOCK) WHERE id=@0 AND roundId=@1",
      [id, roundId],
    );
    if (!application) throw new NotFoundException();
    return application;
  }
  private async inspect(
    em: EntityManager,
    application: Application,
    roundId: string,
    slotId: string,
  ) {
    const [slot]: Array<{ id: string; endsAt: Date; stamp: string }> =
      await em.query(
        "SELECT s.id,s.endsAt,CONVERT(varchar(33),s.endsAt,126) stamp FROM interview_slots s WITH(UPDLOCK,HOLDLOCK) JOIN recruitment_rounds r ON r.id=s.roundId WHERE s.id=@0 AND s.roundId=@1 AND s.status='open' AND r.status<>'closed' AND s.startsAt>SYSUTCDATETIME()",
        [slotId, roundId],
      );
    const [clock]: Array<{ now: Date }> = await em.query(
      "SELECT SYSUTCDATETIME() now",
    );
    const [user]: RecoveryUser[] = application.userId
      ? await em.query(
          "SELECT id,email,status,mustChangePassword,temporaryPasswordExpiresAt,authVersion FROM users WITH(UPDLOCK,HOLDLOCK) WHERE id=@0",
          [application.userId],
        )
      : [];
    const [verification] = await em.query(
      "SELECT CONVERT(varchar(33),MAX(v),126) stamp FROM (SELECT verifiedAt v FROM cv_applications WHERE id=@0 UNION ALL SELECT createdAt FROM application_events WHERE applicationId=@0 AND kind='email_reverified') proof",
      [application.id],
    );
    const verifiedAt = verification?.stamp
      ? new Date(verification.stamp + "Z")
      : null;
    const [profile]: RecoveryProfile[] = user
      ? await em.query(
          "SELECT status,attemptCount FROM recruitment_profiles WITH(UPDLOCK,HOLDLOCK) WHERE userId=@0",
          [user.id],
        )
      : [];
    const [active] = user
      ? await em.query(
          "SELECT TOP(1) id FROM interview_sessions WHERE userId=@0 AND status IN('created','in_progress','submitted','evaluating','evaluation_failed')",
          [user.id],
        )
      : [];
    const [proof] = user
      ? await em.query(
          "SELECT TOP(1) m.id FROM cv_applications a JOIN interview_bookings b ON b.applicationId=a.id JOIN mail_outbox m ON m.eventKey=CONCAT('booking:',CONVERT(varchar(36),b.id),':1:credentials') WHERE a.userId=@0 AND a.email=@1 AND m.kind='credentials' AND m.sensitive=1",
          [user.id, application.email],
        )
      : [];
    const access = user ? await this.permissions.accessSnapshot(user.id) : null;
    let denied: string | null = null;
    if (!slot) denied = "Chọn khung giờ đang mở trong đúng đợt.";
    else if (
      !user ||
      user.status !== "active" ||
      user.email.toLowerCase() !== application.email.toLowerCase()
    )
      denied = "Tài khoản và email hồ sơ cần được đối chiếu.";
    else if (
      !user.mustChangePassword ||
      !user.temporaryPasswordExpiresAt ||
      !proof
    )
      denied =
        "Chỉ cấp lại tài khoản CV còn dùng mật khẩu tạm, không thay mật khẩu chính thức.";
    else if (user.temporaryPasswordExpiresAt > clock.now)
      denied = "Mật khẩu tạm hiện tại chưa hết hạn.";
    else if (
      !verifiedAt ||
      verifiedAt > clock.now ||
      clock.now.getTime() - verifiedAt.getTime() > 86400000
    )
      denied = "Ứng viên cần xác minh lại email trong vòng 24 giờ.";
    else if (
      !access?.roles.has("intern") ||
      access.roles.has("admin") ||
      access.roles.has("instructor")
    )
      denied = "Không cấp lại credential tuyển dụng cho tài khoản staff.";
    else if (
      !profile ||
      profile.attemptCount >= this.recruitment.attemptConfig().maxAttempts ||
      active ||
      ["passed", "interview_in_progress", "evaluation_pending"].includes(
        profile.status,
      ) ||
      !["booked", "deferred"].includes(application.status)
    )
      denied = "Hồ sơ đang ở trạng thái không cho phép cấp lại.";
    const revision = createHash("sha256")
      .update(
        JSON.stringify([
          application.id,
          application.userId,
          application.email,
          application.status,
          verification?.stamp,
          slot?.id,
          slot?.stamp,
          user?.authVersion,
          user?.mustChangePassword,
          user?.temporaryPasswordExpiresAt?.toISOString(),
          profile?.status,
          profile?.attemptCount,
        ]),
      )
      .digest("hex");
    return {
      user,
      slot,
      profile,
      now: clock.now,
      view: {
        allowed: !denied,
        message:
          denied ?? "Chỉ đổi mật khẩu tạm đã hết hạn; giữ lịch hẹn và số lượt.",
        revision: !denied ? revision : null,
        expiresAt: slot
          ? new Date(slot.endsAt.getTime() + 86400000).toISOString()
          : null,
      },
    };
  }
  preview(actor: string, roundId: string, id: string, slotId: string) {
    return this.db.transaction(async (em) => {
      const application = await this.application(em, actor, roundId, id);
      return (await this.inspect(em, application, roundId, slotId)).view;
    });
  }
  async recover(
    actor: string,
    roundId: string,
    id: string,
    input: RecoveryInput,
  ) {
    const reason = input.reason.trim();
    if (
      reason.length < 10 ||
      reason.length > 1000 ||
      !/^[a-f0-9]{64}$/.test(input.expectedRevision)
    )
      throw new ConflictException("Cần lý do và bản xem trước hợp lệ.");
    const password = randomBytes(24).toString("base64url"),
      passwordHash = await hash(password, 10);
    return this.db.transaction(async (em) => {
      const application = await this.application(em, actor, roundId, id);
      const [previous] = await em.query(
        "SELECT detail FROM audit_logs WHERE targetType='cv_application' AND targetId=@0 AND actorId=@1 AND action='application.credentials_recovered' AND JSON_VALUE(detail,'$.revision')=@2 AND LOWER(JSON_VALUE(detail,'$.slotId'))=LOWER(@3)",
        [id, actor, input.expectedRevision, input.slotId],
      );
      if (previous)
        return {
          recovered: true,
          duplicate: true,
          mailId: JSON.parse(previous.detail).mailId as string,
        };
      const current = await this.inspect(
        em,
        application,
        roundId,
        input.slotId,
      );
      if (
        !current.view.allowed ||
        !current.user ||
        !current.profile ||
        !current.view.expiresAt ||
        current.view.revision !== input.expectedRevision
      )
        throw new ConflictException({
          code: "CREDENTIAL_RECOVERY_CHANGED",
          message:
            current.view.message + " Tải lại bản xem trước trước khi tiếp tục.",
        });
      const [sending] = await em.query(
        "SELECT TOP(1) m.id FROM cv_applications a LEFT JOIN interview_bookings b ON b.applicationId=a.id JOIN mail_outbox m WITH(UPDLOCK,HOLDLOCK) ON (m.eventKey LIKE CONCAT('booking:',CONVERT(varchar(36),b.id),':%') OR m.eventKey LIKE CONCAT('credential-recovery:',CONVERT(varchar(36),a.id),':%')) WHERE a.userId=@0 AND m.kind='credentials' AND m.sensitive=1 AND m.status='sending'",
        [current.user.id],
      );
      if (sending)
        throw new ConflictException({
          code: "CREDENTIAL_DELIVERY_IN_PROGRESS",
          message:
            "Email credential cũ đang gửi. Đợi đối chiếu giao nhận trước khi cấp lại.",
        });
      await em.query(
        "UPDATE m SET status='cancelled',sealedPayload=NULL,updatedAt=SYSUTCDATETIME() FROM cv_applications a LEFT JOIN interview_bookings b ON b.applicationId=a.id JOIN mail_outbox m ON (m.eventKey LIKE CONCAT('booking:',CONVERT(varchar(36),b.id),':%') OR m.eventKey LIKE CONCAT('credential-recovery:',CONVERT(varchar(36),a.id),':%')) WHERE a.userId=@0 AND m.kind='credentials' AND m.sensitive=1 AND m.status IN('pending','uncertain','dead')",
        [current.user.id],
      );
      await em.query(
        "UPDATE users SET passwordHash=@1,mustChangePassword=1,temporaryPasswordExpiresAt=@2,authVersion=authVersion+1,updatedAt=SYSUTCDATETIME() WHERE id=@0",
        [current.user.id, passwordHash, current.view.expiresAt],
      );
      await em.query(
        "UPDATE refresh_tokens SET revokedAt=SYSUTCDATETIME() WHERE userId=@0 AND revokedAt IS NULL",
        [current.user.id],
      );
      const mailId = await this.mail.enqueue(
        {
          eventKey: `credential-recovery:${application.id}:${input.expectedRevision}`,
          ownerId: actor,
          to: application.email,
          sensitive: true,
          availableAt: current.now,
          expiresAt: new Date(current.view.expiresAt!),
          content: {
            kind: "credentials",
            name: application.fullName,
            username: application.email,
            password,
            ctaPath: "/login",
          },
        },
        em,
      );
      await em.query(
        "INSERT INTO application_events(id,applicationId,kind,message) VALUES(NEWID(),@0,'credentials_recovered',N'Đã cấp lại mật khẩu tạm qua email xác minh; giữ nguyên lịch và số lượt phỏng vấn.')",
        [id],
      );
      await em.insert(AuditLog, {
        actorId: actor,
        action: "application.credentials_recovered",
        targetType: "cv_application",
        targetId: id,
        detail: JSON.stringify({
          reason,
          revision: input.expectedRevision,
          slotId: input.slotId,
          mailId,
          userId: current.user.id,
          expiresAt: current.view.expiresAt,
          attemptsPreserved: current.profile.attemptCount,
        }),
      });
      return { recovered: true, duplicate: false, mailId };
    });
  }
}
