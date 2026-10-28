import { BadRequestException } from "@nestjs/common";
import { z } from "zod";
export interface CvSegment {
  ref: string;
  text: string;
}
export interface SlotInput {
  startsAt: string;
  endsAt: string;
  timezone: string;
  capacity: number;
  minimumPreparationMinutes: number;
  credentialsLeadMinutes: number;
}
export function validateSlot(slot: SlotInput, now = new Date()) {
  const start = new Date(slot.startsAt),
    end = new Date(slot.endsAt);
  if (
    ![slot.startsAt, slot.endsAt].every((v) =>
      /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(v),
    ) ||
    !Number.isFinite(start.getTime()) ||
    !Number.isFinite(end.getTime()) ||
    end <= start ||
    end.getTime() - start.getTime() > 4 * 3600000 ||
    start <= now ||
    !Number.isInteger(slot.capacity) ||
    slot.capacity < 1 ||
    slot.capacity > 100 ||
    !Number.isInteger(slot.minimumPreparationMinutes) ||
    slot.minimumPreparationMinutes < 30 ||
    slot.minimumPreparationMinutes > 10080 ||
    !Number.isInteger(slot.credentialsLeadMinutes) ||
    slot.credentialsLeadMinutes < 5 ||
    slot.credentialsLeadMinutes > slot.minimumPreparationMinutes ||
    start.getTime() - now.getTime() < slot.minimumPreparationMinutes * 60000
  )
    throw new BadRequestException({
      code: "SLOT_INVALID",
      message:
        "Khung giờ cần ở tương lai, có sức chứa hợp lệ và đủ thời gian chuẩn bị.",
    });
  try {
    new Intl.DateTimeFormat("vi-VN", { timeZone: slot.timezone }).format(start);
  } catch {
    throw new BadRequestException("Múi giờ không hợp lệ.");
  }
  return { start, end };
}
const factsSchema = z
  .object({
    confidence: z.number().min(0).max(1),
    missing: z.array(z.string().min(1).max(240)).max(12),
    facts: z
      .array(
        z
          .object({
            skill: z.string().min(1).max(120),
            ref: z.string().max(40),
            quote: z.string().min(5).max(500),
          })
          .strict(),
      )
      .max(40),
  })
  .strict();
export type CvFacts = z.infer<typeof factsSchema>;
// Use the server's actual limits in structured generation too. Otherwise short
// labels such as "CSS3" can pass the provider schema and fail only after generation.
export const cvFactsOutputSchema = z.toJSONSchema(factsSchema);
delete cvFactsOutputSchema.$schema;
export function validateCvFacts(raw: unknown, segments: CvSegment[]): CvFacts {
  const parsed = factsSchema.parse(raw);
  for (const fact of parsed.facts)
    if (
      !segments.some((s) => s.ref === fact.ref && s.text.includes(fact.quote))
    )
      throw Error("CV_EVIDENCE_INVALID");
  return parsed;
}
const roleMatch = z
  .object({
    roleCode: z.string().max(32).nullable(),
    factIndexes: z.array(z.number().int().min(0)).max(40),
    confidence: z.number().min(0).max(1),
    reason: z.string().min(1).max(1000),
  })
  .strict();
export type RoleMatch = z.infer<typeof roleMatch>;
export function validateRoleMatch(
  raw: unknown,
  roles: string[],
  factCount: number,
): RoleMatch {
  const result = roleMatch.parse(raw);
  if (
    result.roleCode !== null &&
    (!roles.includes(result.roleCode) ||
      !result.factIndexes.length ||
      result.factIndexes.some((i) => i >= factCount))
  )
    throw Error("CV_ROLE_MATCH_INVALID");
  return result;
}
