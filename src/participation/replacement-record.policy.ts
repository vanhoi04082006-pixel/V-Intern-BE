import { z } from "zod";
import { validateReplacementAdvice } from "./replacement-advice.policy";
const uuid = z.string().uuid(),
  score = z.number().min(0).max(100).nullable();
const candidate = z
  .object({
    userId: uuid,
    displayName: z.string().max(160),
    roleCode: z.string().max(32),
    overallScore: score,
    technicalScore: score,
    strengths: z.array(z.string().max(300)).max(5),
    weaknesses: z.array(z.string().max(300)).max(5),
    evaluatedAt: z.string().nullable(),
    evidenceRef: z.string().max(160),
  })
  .strict();
const record = z
  .object({
    schemaVersion: z.literal(1),
    intentId: uuid.optional(),
    contextHash: z.string().regex(/^[a-f0-9]{64}$/),
    aiRunId: uuid.nullable(),
    advice: z.unknown(),
    source: z
      .object({
        scope: z
          .object({
            sessionId: uuid,
            projectId: uuid,
            assignmentId: uuid,
            internId: uuid,
            roleCode: z.string().max(32),
          })
          .strict(),
        incident: z
          .object({
            id: uuid,
            evidenceRef: z.string().max(160),
            deadlineVersion: z.number().int().positive(),
            policyVersion: z.number().int().positive(),
            ordinal: z.number().int().positive(),
            points: z.number().min(0).max(100),
            activeIncidentCount: z.number().int().min(1).optional(),
            replacementFrom: z.number().int().min(1).max(50).optional(),
          })
          .strict(),
        candidates: z.array(candidate).max(20),
        scanned: z.number().int().min(0).max(60),
        total: z.number().int().min(0),
        searchLimited: z.boolean(),
      })
      .strict(),
  })
  .strict();
export function parseReplacementAdviceRecord(value: unknown) {
  const parsed = record.parse(value),
    source = parsed.source;
  if (
    source.incident.evidenceRef !==
      `incident:${source.incident.id.toLowerCase()}` ||
    new Set(source.candidates.map((c) => c.userId.toLowerCase())).size !==
      source.candidates.length ||
    source.candidates.some(
      (c) =>
        c.evidenceRef !== `candidate:${c.userId.toLowerCase()}:recruitment` ||
        c.roleCode !== source.scope.roleCode,
    )
  )
    throw Error("REPLACEMENT_ADVICE_RECORD_INVALID");
  return {
    ...parsed,
    advice: validateReplacementAdvice(
      parsed.advice,
      source.candidates,
      source.incident.evidenceRef,
    ),
  };
}
