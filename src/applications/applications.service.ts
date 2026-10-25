import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { DataSource, EntityManager } from "typeorm";
import { CommunicationsService } from "../communications/communications.service";
import { ApplyDto } from "./application.dto";
import { CvStorage } from "./cv-storage";
import { RecruitmentRoundsService } from "./recruitment-rounds.service";
import { RecruitmentService } from "../recruitment/recruitment.service";
import { RecruitmentProfile } from "../recruitment/entities/recruitment-profile.entity";
import { computeAttemptGate } from "../recruitment/attempt-policy";
export const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export interface CandidateApplication {
  id: string;
  roundId: string;
  fullName: string;
  email: string;
  status: string;
  verifiedAt: Date | null;
  segmentsJson: string | null;
  revision: number;
  fileId: string | null;
  fileFormat: string | null;
  matchedRole: string | null;
  userId: string | null;
}
@Injectable()
export class ApplicationsService {
  constructor(
    private readonly db: DataSource,
    private readonly mail: CommunicationsService,
    private readonly storage: CvStorage,
    private readonly rounds: RecruitmentRoundsService,
    private readonly recruitment: RecruitmentService,
  ) {}
  async event(em: EntityManager, id: string, kind: string, message: string) {
    await em.query(
      "INSERT INTO application_events(applicationId,kind,message) VALUES(@0,@1,@2)",
      [id, kind, message],
    );
  }
  async apply(
    dto: ApplyDto,
    file: { buffer: Buffer; mimetype: string; originalname: string },
  ) {
    if (!file) throw new BadRequestException("Cần đính kèm CV PDF/DOCX.");
    if (dto.consentVersion !== "cv-consent-v1")
      throw new BadRequestException("Cần đồng ý xử lý CV.");
    const email = dto.email.trim().toLowerCase();
    const [round] = await this.db.query(
      "SELECT id FROM recruitment_rounds WHERE id=@0 AND status='open' AND opensAt<=SYSUTCDATETIME() AND closesAt>SYSUTCDATETIME()",
      [dto.roundId],
    );
    if (!round)
      throw new BadRequestException({
        code: "APPLICATIONS_CLOSED",
        message: "Đợt tuyển chưa mở hoặc đã đóng.",
      });
    if (
      (
        await this.db.query(
          "SELECT id FROM cv_applications WHERE roundId=@0 AND email=@1",
          [dto.roundId, email],
        )
      ).length
    )
      return { accepted: true };
    this.mail.ready();
    const extracted = await this.storage.extract(
        file.buffer,
        file.mimetype,
        file.originalname,
      ),
      stored = await this.storage.save(file.buffer);
    try {
      await this.db.transaction(async (em) => {
        const stillOpen = await em.query(
          "SELECT id FROM recruitment_rounds WITH(UPDLOCK,HOLDLOCK) WHERE id=@0 AND status='open' AND opensAt<=SYSUTCDATETIME() AND closesAt>SYSUTCDATETIME()",
          [dto.roundId],
        );
        if (!stillOpen.length)
          throw new BadRequestException({
            code: "APPLICATIONS_CLOSED",
            message: "Đợt tuyển vừa đóng. Hồ sơ chưa được nhận.",
          });
        const prior = await em.query(
          "SELECT id FROM cv_applications WITH(UPDLOCK,HOLDLOCK) WHERE roundId=@0 AND email=@1",
          [dto.roundId, email],
        );
        if (prior.length) throw new ConflictException("APPLICATION_DUPLICATE");
        const id = randomUUID(),
          token = randomBytes(32).toString("base64url"),
          now = new Date();
        await em.query(
          `INSERT INTO cv_applications(id,roundId,email,fullName,consentVersion,consentedAt,verificationHash,verificationExpiresAt,fileId,fileFormat,fileSha256,segmentsJson)
          VALUES(@0,@1,@2,@3,@4,@5,@6,@7,@8,@9,@10,@11)`,
          [
            id,
            dto.roundId,
            email,
            dto.fullName.trim(),
            dto.consentVersion,
            now.toISOString(),
            digest(token),
            new Date(now.getTime() + 86400000).toISOString(),
            stored.id,
            extracted.format,
            stored.sha256,
            JSON.stringify(extracted.segments),
          ],
        );
        await this.event(
          em,
          id,
          "submitted",
          "Đã nhận CV. Chờ xác minh email.",
        );
        await this.mail.enqueue(
          {
            eventKey: `cv.verify:${id}:1`,
            to: email,
            content: {
              kind: "verify",
              name: dto.fullName,
              ctaPath: `/apply#verify=${token}`,
            },
            availableAt: now,
            expiresAt: new Date(now.getTime() + 86400000),
            sensitive: true,
          },
          em,
        );
      });
    } catch (error) {
      await this.storage.remove(stored.id);
      if (!(error instanceof ConflictException)) throw error;
    }
    return { accepted: true };
  }
  async requestAccess(roundId: string, email: string) {
    await this.db.transaction(async (em) => {
      const [application] = await em.query(
        "SELECT id,fullName FROM cv_applications WITH(UPDLOCK,HOLDLOCK) WHERE roundId=@0 AND email=@1 AND lastVerificationSentAt<=DATEADD(second,-60,SYSUTCDATETIME())",
        [roundId, email.trim().toLowerCase()],
      );
      if (!application) return;
      const token = randomBytes(32).toString("base64url"),
        now = new Date();
      await em.query(
        "UPDATE cv_applications SET verificationHash=@1,verificationExpiresAt=@2,lastVerificationSentAt=@3 WHERE id=@0",
        [
          application.id,
          digest(token),
          new Date(now.getTime() + 86400000).toISOString(),
          now.toISOString(),
        ],
      );
      await this.mail.enqueue(
        {
          eventKey: `cv.access:${application.id}:${randomUUID()}`,
          to: email.trim().toLowerCase(),
          content: {
            kind: "verify",
            name: application.fullName,
            ctaPath: `/apply#verify=${token}`,
          },
          availableAt: now,
          expiresAt: new Date(now.getTime() + 86400000),
          sensitive: true,
        },
        em,
      );
    });
    return { accepted: true };
  }
  async verify(token: string) {
    const capability = randomBytes(32).toString("base64url");
    await this.db.transaction(async (em) => {
      const [app]: CandidateApplication[] = await em.query(
        "SELECT * FROM cv_applications WITH(UPDLOCK,HOLDLOCK) WHERE verificationHash=@0 AND verificationExpiresAt>SYSUTCDATETIME()",
        [digest(token)],
      );
      if (!app)
        throw new BadRequestException({
          code: "VERIFICATION_INVALID",
          message:
            "Liên kết đã hết hạn hoặc đã được dùng. Yêu cầu email mới để tiếp tục.",
        });
      const readable =
        JSON.parse(app.segmentsJson ?? "[]")
          .map((s: { text: string }) => s.text)
          .join("").length >= 40;
      await em.query(
        `UPDATE cv_applications SET verificationHash=NULL,verificationExpiresAt=NULL,capabilityHash=@1,capabilityExpiresAt=DATEADD(day,7,SYSUTCDATETIME()),verifiedAt=COALESCE(verifiedAt,SYSUTCDATETIME()),
        status=CASE WHEN status='unverified' THEN @2 ELSE status END,updatedAt=SYSUTCDATETIME() WHERE id=@0`,
        [app.id, digest(capability), readable ? "queued" : "needs_information"],
      );
      if (!app.verifiedAt)
        await this.event(
          em,
          app.id,
          "verified",
          readable
            ? "Email đã xác minh. Hồ sơ đang chờ Agent phân tích."
            : "Email đã xác minh. CV chưa có đủ văn bản đọc được; cần bổ sung, hệ thống chưa có OCR.",
        );
      else
        await this.event(em, app.id, "email_reverified", "Email đã được xác minh lại. Lịch hẹn, vai trò và số lượt phỏng vấn được giữ nguyên.");
    });
    return capability;
  }
  async candidate(token: string | undefined): Promise<CandidateApplication> {
    if (!token || !/^[\w-]{43}$/.test(token)) throw new UnauthorizedException();
    const [app]: CandidateApplication[] = await this.db.query(
      "SELECT * FROM cv_applications WHERE capabilityHash=@0 AND capabilityExpiresAt>SYSUTCDATETIME() AND verifiedAt IS NOT NULL",
      [digest(token)],
    );
    if (!app) throw new UnauthorizedException();
    return app;
  }
  async leaveCandidateCapability(token: unknown) {
    if (typeof token === "string" && /^[\w-]{43}$/.test(token))
      await this.db.query(
        "UPDATE cv_applications SET capabilityHash=NULL,capabilityExpiresAt=NULL WHERE capabilityHash=@0",
        [digest(token)],
      );
  }
  async view(app: CandidateApplication) {
    const timeline = await this.db.query(
      "SELECT kind,message,createdAt FROM application_events WHERE applicationId=@0 ORDER BY createdAt,id",
      [app.id],
    );
    const [booking] = await this.db.query(
      "SELECT b.id,b.version,b.status,s.roleCode,r.name roleName,s.startsAt,s.endsAt,s.timezone FROM interview_bookings b JOIN interview_slots s ON s.id=b.slotId JOIN career_roles r ON r.code=s.roleCode WHERE b.applicationId=@0",
      [app.id],
    );
    return {
      id: app.id,
      fullName: app.fullName,
      status: app.status,
      matchedRole: app.matchedRole,
      revision: app.revision,
      hasCv: !!app.fileId,
      timeline,
      booking: booking ?? null,
    };
  }
  async supplement(
    app: CandidateApplication,
    file: { buffer: Buffer; mimetype: string; originalname: string },
  ) {
    if (!file) throw new BadRequestException("Cần đính kèm CV.");
    const extracted = await this.storage.extract(
        file.buffer,
        file.mimetype,
        file.originalname,
      ),
      stored = await this.storage.save(file.buffer);
    try {
      await this.db.transaction(async (em) => {
        const [current] = await em.query(
          "SELECT id FROM cv_applications WITH(UPDLOCK,HOLDLOCK) WHERE id=@0 AND revision=@1 AND status IN('needs_information','failed','waitlisted')",
          [app.id, app.revision],
        );
        if (!current)
          throw new ConflictException(
            "Hồ sơ đang được xử lý hoặc đã có lịch, không thể thay CV lúc này.",
          );
        await em.query(
          "UPDATE cv_applications SET fileId=@1,fileFormat=@2,fileSha256=@3,segmentsJson=@4,revision=revision+1,status=@5,factsJson=NULL,matchJson=NULL,matchedRole=NULL,updatedAt=SYSUTCDATETIME() WHERE id=@0",
          [
            app.id,
            stored.id,
            extracted.format,
            stored.sha256,
            JSON.stringify(extracted.segments),
            extracted.segments.map((s) => s.text).join("").length >= 40
              ? "queued"
              : "needs_information",
          ],
        );
        await this.event(em, app.id, "supplemented", "Đã nhận CV bổ sung.");
      });
    } catch (error) {
      await this.storage.remove(stored.id);
      throw error;
    }
    if (app.fileId) await this.storage.remove(app.fileId);
    return this.view(await this.candidateById(app.id));
  }
  private async candidateById(id: string): Promise<CandidateApplication> {
    const [app] = await this.db.query(
      "SELECT * FROM cv_applications WHERE id=@0",
      [id],
    );
    return app;
  }
  async listStaff(actor: string, roundId: string, page: number) {
    await this.rounds.authorize(actor, roundId);
    const items = await this.db.query(
      "SELECT id,fullName,email,status,matchedRole,revision,createdAt,lastCode FROM cv_applications WHERE roundId=@0 ORDER BY createdAt DESC,id OFFSET @1 ROWS FETCH NEXT 25 ROWS ONLY",
      [roundId, (page - 1) * 25],
    );
    const [count] = await this.db.query(
      "SELECT COUNT(*) total FROM cv_applications WHERE roundId=@0",
      [roundId],
    );
    return { items, total: count.total, page, pageSize: 25 };
  }
  async staffApplication(actor: string, roundId: string, id: string) {
    await this.rounds.authorize(actor, roundId);
    const app = await this.candidateById(id);
    if (!app || app.roundId.toLowerCase() !== roundId.toLowerCase())
      throw new NotFoundException();
    return app;
  }
  async download(app: CandidateApplication) {
    if (!app.fileId) throw new NotFoundException();
    return {
      bytes: await this.storage.read(app.fileId),
      format: app.fileFormat,
    };
  }
  async staffView(actor: string, roundId: string, id: string) {
    const application = await this.staffApplication(actor, roundId, id);
    const [analysis] = await this.db.query(
      "SELECT factsJson,matchJson FROM cv_applications WHERE id=@0",
      [id],
    );
    return {
      ...(await this.view(application)),
      analysis: {
        facts: analysis.factsJson ? JSON.parse(analysis.factsJson) : null,
        match: analysis.matchJson ? JSON.parse(analysis.matchJson) : null,
      },
      interviewPolicy: await this.interviewPolicy(application),
    };
  }
  private async interviewPolicy(application: CandidateApplication) {
    if (!application.userId) return null;
    const profile = await this.db
      .getRepository(RecruitmentProfile)
      .findOneBy({ userId: application.userId });
    if (!profile) return null;
    const serverNow = this.recruitment.admissions.now();
    const gate = computeAttemptGate(
      {
        profileStatus: profile.status,
        attemptCount: profile.attemptCount,
        lastFailedAt: await this.recruitment.latestFailedResultAt(profile.id),
      },
      this.recruitment.attemptConfig(),
      serverNow,
    );
    const [booking]: Array<{ id: string; version: number; createdAt: Date }> =
      await this.db.query(
        "SELECT id,version,createdAt FROM interview_bookings WHERE applicationId=@0",
        [application.id],
      );
    const consumed = booking
      ? await this.db.query(
          "SELECT bookingId FROM interview_admissions WHERE bookingId=@0 AND bookingVersion=@1",
          [booking.id, booking.version],
        )
      : [];
    const sessions: Array<{ status: string; startedAt: Date | null }> =
      profile.currentInterviewSessionId
        ? await this.db.query(
            "SELECT status,startedAt FROM interview_sessions WHERE id=@0",
            [profile.currentInterviewSessionId],
          )
        : [];
    const current = sessions[0],
      active =
        current &&
        [
          "created",
          "in_progress",
          "submitted",
          "evaluating",
          "evaluation_failed",
        ].includes(current.status);
    // Only an outcome tied to this CV may reveal its recommended career to this round's staff.
    const [result]: Array<{
      recommendedRole: string | null;
      overallScore: number;
    }> = await this.db.query(
      "SELECT TOP(1) r.recommendedRole,r.overallScore FROM recruitment_results r JOIN interview_admissions a ON a.sessionId=r.sessionId WHERE a.applicationId=@0 AND r.decision='failed' ORDER BY r.evaluatedAt DESC,r.createdAt DESC",
      [application.id],
    );
    const alternate =
      result && result.overallScore >= 50 && result.overallScore <= 70
        ? result.recommendedRole
        : null;
    return {
      serverNow: serverNow.toISOString(),
      attemptsUsed: profile.attemptCount,
      attemptsRemaining: gate.attemptsRemaining,
      nextEligibleAt: gate.nextEligibleAt,
      allowedRoleCodes: [
        ...new Set(
          [application.matchedRole, alternate].filter(
            (role): role is string => !!role,
          ),
        ),
      ],
      canRebook: Boolean(
        booking &&
        ["booked", "deferred"].includes(application.status) &&
        profile.status !== "passed" &&
        !active &&
        gate.attemptsRemaining > 0 &&
        (consumed.length ||
          (current?.startedAt && current.startedAt >= booking.createdAt)),
      ),
    };
  }
}
