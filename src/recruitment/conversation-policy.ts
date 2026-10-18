import { ConflictException } from "@nestjs/common";
import { AiInvalidResponseError } from "../ai/ai-errors";

export const INTERVIEWER_OUTPUT_SCHEMA = {
  type: "object",
  properties: { message: { type: "string" } },
  required: ["message"],
  additionalProperties: false,
};

export function validateInterviewerResponse(raw: unknown): { message: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new AiInvalidResponseError("Invalid interviewer response.");
  const v = raw as Record<string, unknown>;
  if (
    Object.keys(v).some((k) => k !== "message") ||
    typeof v.message !== "string" ||
    v.message.trim().length < 10 ||
    v.message.length > 2000
  )
    throw new AiInvalidResponseError("Invalid interviewer message.");
  return { message: v.message.trim() };
}

export function assertCurrentQuestion(
  questions: Array<{ id: string; position: number }>,
  answeredIds: Set<string>,
  questionId: string,
): void {
  const next = [...questions]
    .sort((a, b) => a.position - b.position)
    .find((q) => !answeredIds.has(q.id.toLowerCase()));
  if (!next || next.id.toLowerCase() !== questionId.toLowerCase())
    throw new ConflictException({
      code: "INTERVIEW_TURN_CHANGED",
      message:
        "Hãy trả lời câu hiện tại; câu đã gửi được giữ nguyên trong hội thoại.",
    });
}
