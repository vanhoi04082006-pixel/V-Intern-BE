import { DataSource } from "typeorm";
import { AiService } from "../ai/ai.service";
import { RecruitmentEvaluationService } from "./recruitment-evaluation.service";
import { RecruitmentService } from "./recruitment.service";

describe("chat evaluation evidence", () => {
  function harness(delivered = true) {
    const session = {
      id: "s",
      userId: "u",
      status: "submitted",
      questionCount: 10,
      roleCode: "frontend",
    };
    const questions = Array.from({ length: 10 }, (_, n) => ({
      id: `q${n}`,
      position: n + 1,
      category: n < 2 || n > 7 ? "soft" : "technical",
      promptSnapshot: `Bank ${n}`,
      rubricSnapshot: JSON.stringify({
        expected: `Reference ${n}`,
        keywords: ["concrete"],
        scoringGuide: "Evidence",
        phase: "technical",
      }),
    }));
    const turns = delivered
      ? questions.map((q) => ({
          questionId: q.id.toUpperCase(),
          prompt: `Delivered ${q.position}`,
          clarificationPrompt: q.position === 1 ? "Clarified question" : null,
        }))
      : [];
    const builder = {
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn(async () => session),
    };
    const repo = (target: { name: string }) => ({
      createQueryBuilder: () => builder,
      find: async () =>
        target.name === "InterviewSessionQuestion"
          ? questions
          : questions.map((q) => ({
              sessionQuestionId: q.id,
              answerText: `Answer ${q.position}`,
            })),
    });
    const db = {
      transaction: async (work: (em: unknown) => Promise<unknown>) =>
        work({ getRepository: repo, save: async () => session }),
      getRepository: repo,
      query: jest.fn(async () => turns),
    };
    const ai = {
      generateStructuredWithRun: jest.fn(async () => ({
        data: {
          technicalScore: 80,
          softSkillScore: 80,
          criteria: [],
          strengths: [],
          weaknesses: [],
          feedback: "Synthetic evaluation",
        },
        run: { id: "run" },
        result: { model: "test" },
      })),
    };
    const service = new RecruitmentEvaluationService(
      ai as unknown as AiService,
      {} as RecruitmentService,
      db as unknown as DataSource,
    );
    Object.defineProperty(service, "persistEvaluation", {
      value: jest.fn(async () => {
        throw new Error("STOP_AFTER_AI");
      }),
    });
    return { service, ai, session };
  }
  it("grades delivered wording/clarification against internal bank references, not a different planned prompt", async () => {
    const h = harness();
    await expect(h.service.evaluateSession("s", {})).rejects.toThrow(
      "STOP_AFTER_AI",
    );
    const call = h.ai.generateStructuredWithRun.mock.calls[0] as unknown as [
      {
        request: { input: { questions: Array<Record<string, unknown>> } };
        promptVersion: string;
      },
    ];
    expect(call[0].promptVersion).toBe("recruitment-evaluation-v2");
    expect(call[0].request.input.questions).toHaveLength(10);
    expect(call[0].request.input.questions[0]).toMatchObject({
      prompt: "Delivered 1",
      clarification: "Clarified question",
      rubric: { expected: "Reference 0" },
    });
    expect(
      call[0].request.input.questions.some((q) =>
        String(q.prompt).startsWith("Bank"),
      ),
    ).toBe(false);
  });
  it("rejects missing delivered chat evidence and leaves the session retryable without calling AI", async () => {
    const h = harness(false);
    await expect(h.service.evaluateSession("s", {})).rejects.toMatchObject({
      response: { code: "AI_INVALID_RESPONSE" },
    });
    expect(h.ai.generateStructuredWithRun).not.toHaveBeenCalled();
    expect(h.session.status).toBe("evaluation_failed");
  });
});
