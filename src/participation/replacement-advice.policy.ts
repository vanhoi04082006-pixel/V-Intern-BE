import { z } from "zod";

const schema = z
  .object({
    candidateId: z
      .string()
      .uuid()
      .transform((id) => id.toLowerCase())
      .nullable(),
    reason: z.string().trim().min(20).max(2000),
    evidenceRefs: z.array(z.string().max(160)).max(12),
    limitations: z.array(z.string().trim().min(1).max(300)).max(8),
  })
  .strict();
export type ReplacementAdvice = z.infer<typeof schema>;
export function validateReplacementAdvice(
  raw: unknown,
  candidates: readonly { userId: string; evidenceRef: string }[],
  incidentRef: string,
): ReplacementAdvice {
  const value = schema.parse(raw),
    allowed = new Set([incidentRef, ...candidates.map((c) => c.evidenceRef)]);
  if (value.evidenceRefs.some((ref) => !allowed.has(ref)))
    throw Error("REPLACEMENT_ADVICE_EVIDENCE_INVALID");
  if (value.candidateId !== null) {
    const selected = candidates.find(
      (c) => c.userId.toLowerCase() === value.candidateId,
    );
    if (!selected || !value.evidenceRefs.includes(selected.evidenceRef))
      throw Error("REPLACEMENT_ADVICE_CANDIDATE_INVALID");
  }
  return value;
}
export function replacementAdviceSchema(candidateIds: readonly string[]) {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      candidateId: {
        anyOf: [
          ...(candidateIds.length
            ? [{ type: "string", enum: [...candidateIds] }]
            : []),
          { type: "null" },
        ],
      },
      reason: { type: "string", minLength: 20, maxLength: 2000 },
      evidenceRefs: { type: "array", items: { type: "string" }, maxItems: 12 },
      limitations: { type: "array", items: { type: "string" }, maxItems: 8 },
    },
    required: ["candidateId", "reason", "evidenceRefs", "limitations"],
  };
}
