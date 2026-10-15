import { ConfigService } from "@nestjs/config";
import { DataSource } from "typeorm";
import { AiService } from "../ai/ai.service";
import { InterviewService } from "./interview.service";
import { InterviewConversationService } from "./interview-conversation.service";
import { RecruitmentService } from "./recruitment.service";
import { InterviewFollowUpService } from './interview-follow-up.service';

const sessionId = "session-1";
const userId = "intern-1";
const session = () => ({
  id: sessionId,
  userId,
  status: "in_progress",
  roleCode: "backend",
  questionCount: 10,
  expiresAt: new Date(Date.now() + 600000),
});
const questions = [
  {
    id: "q1",
    position: 1,
    category: "soft",
    difficultySnapshot: "easy",
    promptSnapshot: "Introduce yourself",
    sessionId,
  },
  {
    id: "q2",
    position: 2,
    category: "technical",
    difficultySnapshot: "easy",
    promptSnapshot: "Future secret question",
    sessionId,
  },
];

describe("public interview delivery", () => {
  function service(owner = userId, count = 10) {
    const current = { ...session(), userId: owner, questionCount: count };
    const builder = {
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(current),
    };
    const repository = (target: { name: string }) => ({
      createQueryBuilder: () => builder,
      findOne: async () => current,
      find: async () =>
        target.name === "InterviewSessionQuestion"
          ? questions
          : [
              {
                sessionQuestionId: "q1",
                answerText: "My persisted answer",
                answeredAt: new Date(),
              },
            ],
    });
    const db = {
      getRepository: repository,
      transaction: async (work: (manager: unknown) => Promise<unknown>) =>
        work({ getRepository: repository }),
    };
    return new InterviewService(
      {} as ConfigService,
      {} as RecruitmentService,
      db as unknown as DataSource,
    );
  }

  it("returns answered evidence without revealing future prompts for ten-question sessions", async () => {
    const result = await service().getQuestions(userId, sessionId);
    expect(result.questions.map((q) => q.id)).toEqual(["q1"]);
    expect(result.questions[0].answerText).toBe("My persisted answer");
    expect(JSON.stringify(result)).not.toContain("Future secret question");
  });

  it("retains full server-only snapshots for orchestration and legacy sessions", async () => {
    const internal = await service().getQuestions(userId, sessionId, true);
    const legacy = await service(userId, 8).getQuestions(userId, sessionId);
    expect(internal.questions.map((q) => q.id)).toEqual(["q1", "q2"]);
    expect(legacy.questions.map((q) => q.id)).toEqual(["q1", "q2"]);
  });

  it("rejects a foreign session before returning persisted answers", async () => {
    await expect(
      service("another-intern").getQuestions(userId, sessionId),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe("clarification concurrency", () => {
  function harness() {
    const current = session();
    let currentQuestion = "q1";
    let clarification: string | null = null;
    const turn = {
      questionId: "q1",
      status: "ready",
      prompt: "Introduce yourself",
      clarificationPrompt: null,
    };
    const query = jest.fn(async (sql: string, params?: unknown[]) => {
      if (sql.startsWith("SELECT status,expiresAt FROM interview_sessions"))
        return params?.[1] === userId ? [current] : [];
      if (sql.includes("SELECT TOP(1) q.id")) return [{ id: currentQuestion }];
      if (
        sql.startsWith(
          "UPDATE interview_conversation_turns SET clarificationPrompt=",
        )
      ) {
        clarification = params?.[2] as string;
        return [];
      }
      if (sql.includes("FROM interview_conversation_turns")) return [turn];
      return [];
    });
    const db = {
      query,
      transaction: async (work: (manager: unknown) => Promise<unknown>) =>
        work({ query }),
    };
    const interviews = {
      getQuestions: jest
        .fn()
        .mockResolvedValue({
          session: current,
          questions: [
            {
              id: "q1",
              position: 1,
              prompt: "Introduce yourself",
              answered: false,
            },
          ],
        }),
    };
    const ai = {
      generateStructuredWithRun: jest
        .fn()
        .mockResolvedValue({
          data: { message: "Tell us a little about yourself." },
          run: { id: "run-1" },
        }),
    };
    const service = new InterviewConversationService(
      interviews as unknown as InterviewService,
      db as unknown as DataSource,
      ai as unknown as AiService,
      {} as InterviewFollowUpService,
    );
    return {
      service,
      ai,
      current,
      advance: () => {
        currentQuestion = "q2";
      },
      clarification: () => clarification,
    };
  }

  it("does not generate clarification when another tab already answered the captured question", async () => {
    const h = harness();
    h.advance();
    await expect(h.service.clarify(userId, sessionId)).rejects.toThrow();
    expect(h.ai.generateStructuredWithRun).not.toHaveBeenCalled();
    expect(h.clarification()).toBeNull();
  });

  it("persists the clarification when the same owned turn remains active", async () => {
    const h = harness();
    await h.service.clarify(userId, sessionId);
    expect(h.clarification()).toBe("Tell us a little about yourself.");
  });

  it.each(["answered", "submitted", "expired"])(
    "does not append clarification if the turn becomes %s during AI generation",
    async (change) => {
      const h = harness();
      h.ai.generateStructuredWithRun.mockImplementationOnce(async () => {
        if (change === "answered") h.advance();
        else if (change === "expired")
          h.current.expiresAt = new Date(Date.now() - 1000);
        else h.current.status = "submitted";
        return {
          data: { message: "Late clarification must not be persisted." },
          run: { id: "run-1" },
        };
      });
      await expect(h.service.clarify(userId, sessionId)).rejects.toThrow();
      expect(h.clarification()).toBeNull();
    },
  );

  it("does not claim clarification using a different principal", async () => {
    const h = harness();
    await expect(
      h.service.clarify("other-intern", sessionId),
    ).rejects.toThrow();
    expect(h.ai.generateStructuredWithRun).not.toHaveBeenCalled();
  });
});
