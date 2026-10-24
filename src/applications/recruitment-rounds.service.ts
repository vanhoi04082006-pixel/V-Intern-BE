import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { DataSource, EntityManager } from "typeorm";
import { PermissionsService } from "../rbac/permissions.service";
import { CreateRoundDto, CreateSlotDto } from "./application.dto";
import { validateSlot } from "./application-policy";
import { questionPhase } from "../recruitment/question-selection";
interface Round {
  id: string;
  ownerId: string;
  name: string;
  status: string;
  opensAt: Date;
  closesAt: Date;
}
@Injectable()
export class RecruitmentRoundsService {
  constructor(
    private readonly db: DataSource,
    private readonly permissions: PermissionsService,
  ) {}
  private async staffAccess(actor: string) {
    const access = await this.permissions.accessSnapshot(actor);
    if (
      !access.permissions.has("applications.manage") ||
      (!access.roles.has("admin") && !access.roles.has("instructor"))
    )
      throw new ForbiddenException();
    return access;
  }
  async authorize(
    actor: string,
    id: string,
    em: EntityManager = this.db.manager,
  ): Promise<Round> {
    const access = await this.staffAccess(actor);
    const [round]: Round[] = await em.query(
      "SELECT * FROM recruitment_rounds WHERE id=@0",
      [id],
    );
    if (
      !round ||
      (!access.roles.has("admin") &&
        round.ownerId.toLowerCase() !== actor.toLowerCase())
    )
      throw new NotFoundException();
    return round;
  }
  async list(actor: string) {
    const access = await this.staffAccess(actor);
    return {
      items: await this.db.query(
        "SELECT TOP(100) id,name,status,opensAt,closesAt,ownerId FROM recruitment_rounds WHERE ownerId=@0 OR @1=1 ORDER BY createdAt DESC",
        [actor, access.roles.has("admin")],
      ),
    };
  }
  async publicRounds() {
    return {
      items: await this.db.query(
        "SELECT TOP(100) id,name,opensAt,closesAt FROM recruitment_rounds WHERE status='open' AND opensAt<=SYSUTCDATETIME() AND closesAt>SYSUTCDATETIME() ORDER BY closesAt",
      ),
    };
  }
  async create(actor: string, dto: CreateRoundDto) {
    await this.staffAccess(actor);
    if (
      !/[Zz]|[+-]\d{2}:\d{2}$/.test(dto.opensAt) ||
      !/[Zz]|[+-]\d{2}:\d{2}$/.test(dto.closesAt) ||
      new Date(dto.closesAt) <= new Date(dto.opensAt) ||
      new Date(dto.closesAt) <= new Date()
    )
      throw new BadRequestException(
        "Thời gian nhận hồ sơ cần hợp lệ, có múi giờ và kết thúc trong tương lai.",
      );
    const id = randomUUID();
    await this.db.query(
      "INSERT INTO recruitment_rounds(id,ownerId,name,opensAt,closesAt) VALUES(@0,@1,@2,@3,@4)",
      [id, actor, dto.name.trim(), dto.opensAt, dto.closesAt],
    );
    return this.detail(actor, id);
  }
  async detail(actor: string, id: string) {
    const round = await this.authorize(actor, id);
    const slots = await this.db.query(
      "SELECT s.*, (SELECT COUNT(*) FROM interview_bookings b WHERE b.slotId=s.id AND b.status='confirmed') booked FROM interview_slots s WHERE s.roundId=@0 ORDER BY startsAt",
      [id],
    );
    return { ...round, slots };
  }
  async readiness(role: string, em: EntityManager = this.db.manager) {
    const [career] = await em.query(
      "SELECT code FROM career_roles WHERE code=@0 AND status='published' AND acceptingApplications=1",
      [role],
    );
    const questions: Array<{ category: string; rubricJson: string }> =
      await em.query(
        "SELECT category,rubricJson FROM interview_questions WHERE roleCode=@0 AND isActive=1",
        [role],
      );
    if (
      !career ||
      questions.filter((q) => q.category === "technical").length < 6 ||
      questions.filter((q) => questionPhase(q) === "introduction").length < 2 ||
      questions.filter((q) => questionPhase(q) === "english").length < 2
    )
      throw new BadRequestException({
        code: "CAREER_NOT_READY",
        message:
          "Nghề cần đang mở tuyển, ít nhất 6 câu chuyên môn, 2 giới thiệu và 2 tiếng Anh trước khi mở lịch.",
      });
  }
  async addSlot(actor: string, roundId: string, dto: CreateSlotDto) {
    const round = await this.authorize(actor, roundId),
      { start } = validateSlot(dto);
    if (round.status === "closed" || start <= round.opensAt)
      throw new BadRequestException(
        "Khung giờ cần sau lúc bắt đầu nhận hồ sơ.",
      );
    await this.readiness(dto.roleCode);
    const id = randomUUID();
    await this.db.query(
      "INSERT INTO interview_slots(id,roundId,roleCode,startsAt,endsAt,timezone,capacity,minimumPreparationMinutes,credentialsLeadMinutes) VALUES(@0,@1,@2,@3,@4,@5,@6,@7,@8)",
      [
        id,
        roundId,
        dto.roleCode,
        dto.startsAt,
        dto.endsAt,
        dto.timezone,
        dto.capacity,
        dto.minimumPreparationMinutes,
        dto.credentialsLeadMinutes,
      ],
    );
    await this.db.query(
      "UPDATE cv_applications SET status='queued' WHERE roundId=@0 AND status='waitlisted'",
      [roundId],
    );
    return this.detail(actor, roundId);
  }
  async status(actor: string, id: string, status: string) {
    await this.authorize(actor, id);
    if (status === "open") {
      const slots = await this.db.query(
        "SELECT roleCode FROM interview_slots WHERE roundId=@0 AND status='open' AND startsAt>SYSUTCDATETIME()",
        [id],
      );
      if (!slots.length)
        throw new BadRequestException(
          "Cần mở ít nhất một khung giờ trước khi mở đợt tuyển.",
        );
      for (const slot of slots) await this.readiness(slot.roleCode);
    }
    await this.db.query("UPDATE recruitment_rounds SET status=@1 WHERE id=@0", [
      id,
      status,
    ]);
    return this.detail(actor, id);
  }
  async closeSlot(actor: string, roundId: string, id: string) {
    await this.authorize(actor, roundId);
    const rows = await this.db.query(
      "UPDATE interview_slots SET status='closed' OUTPUT inserted.id WHERE roundId=@0 AND id=@1",
      [roundId, id],
    );
    if (!rows.length) throw new NotFoundException();
    return { closed: true };
  }
}
