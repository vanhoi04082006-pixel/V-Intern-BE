import { z } from "zod";
const uuid = z.string().uuid(),
  time = z.string().datetime({ offset: true }),
  hash = z.string().regex(/^[a-f0-9]{64}$/);
export const replacementPreviewSchema = z
  .object({
    schemaVersion: z.literal(1),
    preparedAt: time,
    handoverHours: z.number().int().min(1).max(168),
    adviceId: uuid,
    sourceFingerprint: hash,
    summary: z
      .object({
        sessionId: uuid,
        sessionName: z.string().max(256),
        projectId: uuid,
        projectName: z.string().max(256),
        roleCode: z.string().max(32),
        roleName: z.string().max(256),
        oldAssignmentId: uuid,
        oldInternId: uuid,
        oldInternName: z.string().max(256),
        candidateId: uuid,
        candidateName: z.string().max(256),
      })
      .strict(),
    taskPlan: z
      .object({
        handoverAt: time,
        preservedCount: z.number().int().min(0),
        transfers: z
          .array(
            z
              .object({
                id: uuid,
                code: z.string().max(64),
                title: z.string().max(256),
                status: z.enum(["todo", "doing"]),
                version: z.number().int().positive(),
                dueAt: time.nullable(),
                handoverDueAt: time.nullable(),
              })
              .strict(),
          )
          .max(500),
      })
      .strict(),
    warnings: z.array(z.string().max(500)).max(8),
  })
  .strict();
export type ReplacementPreview = z.infer<typeof replacementPreviewSchema>;
export const replacementResultSchema = z
  .object({
    schemaVersion: z.literal(1),
    replacementId: uuid,
    commandId: uuid,
    sessionId: uuid,
    oldAssignmentId: uuid,
    newAssignmentId: uuid,
    oldInternId: uuid,
    newInternId: uuid,
    transferredTaskIds: z.array(uuid).max(500),
    preservedTaskCount: z.number().int().min(0),
    approvedById: uuid,
    approvedAt: time,
    reason: z.string().min(10).max(1000),
    repositoryAccessQueued: z.literal(true),
  })
  .strict();
export type ReplacementResult = z.infer<typeof replacementResultSchema>;
