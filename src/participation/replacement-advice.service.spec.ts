import { DataSource } from "typeorm";
import { PermissionsService } from "../rbac/permissions.service";
import { RecruitmentService } from "../recruitment/recruitment.service";
import { AiService } from "../ai/ai.service";
import { ParticipationLedger } from "./participation-ledger.service";
import { ReplacementAdviceService } from "./replacement-advice.service";
import type { AiInvocation } from "../ai/ai-invocation";
const actor = "11111111-1111-4111-8111-111111111111",
  incident = "22222222-2222-4222-8222-222222222222",
  session = "33333333-3333-4333-8333-333333333333",
  candidate = "44444444-4444-4444-8444-444444444444";
function fixture() {
  let owner = actor,
    version = 1,
    busy = false;
  const roles = new Set(["instructor"]),
    permissions = new Set(["sessions.manage", "recruitment.view"]);
  const context = () => ({
    id: incident,
    sessionId: session,
    projectId: "55555555-5555-4555-8555-555555555555",
    assignmentId: "66666666-6666-4666-8666-666666666666",
    internId: "77777777-7777-4777-8777-777777777777",
    taskId: "88888888-8888-4888-8888-888888888888",
    roleCode: "frontend",
    leadInstructorId: owner,
    deadlineVersion: 1,
    policyVersion: version,
    ordinal: 3,
    points: 5,
    createdAt: new Date("2026-10-25T00:00:00Z"),
  });
  const query = jest.fn(async (sql: string) => {
    if (sql.includes("SELECT status FROM users")) return [{ status: "active" }];
    if (sql.includes("FROM participation_incidents")) return [context()];
    if (sql.includes("SELECT u.id")) return busy ? [] : [{ id: candidate }];
    return [];
  });
  const db = {
    query,
    transaction: async (work: (em: unknown) => Promise<unknown>) =>
      work({ query }),
  };
  const recruitment = {
    listCandidates: jest.fn(async () => ({
      items: [
        {
          userId: candidate,
          displayName: "Ứng viên khả dụng",
          email: "excluded@example.test",
          selectedRole: "frontend",
          status: "passed",
          hasActiveAssignment: false,
          result: {
            overallScore: 85,
            technicalScore: 90,
            softSkillScore: 80,
            strengths: ["Kiểm thử tốt"],
            weaknesses: [],
            evaluatedAt: "2026-10-24T00:00:00Z",
          },
        },
      ],
      total: 1,
    })),
  };
  const ai = {
    generateStructuredWithRun: jest.fn(
      async (input: AiInvocation<unknown>) => ({
        data: input.request.validate({
          candidateId: candidate,
          reason:
            "Đã đạt phỏng vấn đúng vai trò và còn khả dụng theo kiểm tra server.",
          evidenceRefs: [
            `candidate:${candidate}:recruitment`,
            `incident:${incident}`,
          ],
          limitations: [],
        }),
        run: { id: "99999999-9999-4999-8999-999999999999" },
      }),
    ),
  };
  const ledger = {
    event: jest.fn(async (_em: unknown, input: { id: string }) => input.id),
  };
  const service = new ReplacementAdviceService(
    db as unknown as DataSource,
    {
      accessSnapshot: async () => ({ roles, permissions }),
    } as unknown as PermissionsService,
    recruitment as unknown as RecruitmentService,
    ai as unknown as AiService,
    ledger as unknown as ParticipationLedger,
  );
  return {
    service,
    ai,
    query,
    ledger,
    recruitment,
    roles,
    permissions,
    foreign: () => {
      owner = candidate;
    },
    changed: () => {
      version++;
    },
    busy: () => {
      busy = true;
    },
  };
}
it("uses the registered Agent scope and persists grounded advice without exposing candidate email", async () => {
  const f = fixture(),
    result = await f.service.generate(session, incident, actor);
  expect(result.advice.candidateId).toBe(candidate);
  expect(result.requiresInstructorApproval).toBe(true);
  expect(f.ledger.event).toHaveBeenCalledTimes(1);
  expect(f.ai.generateStructuredWithRun).toHaveBeenCalledWith(
    expect.objectContaining({
      feature: "replacement-advice",
      resourceType: "participation_incident",
      resourceId: incident,
      actorId: actor,
    }),
  );
  expect(
    JSON.stringify(
      f.ai.generateStructuredWithRun.mock.calls[0][0].request.input,
    ),
  ).not.toContain("excluded@example.test");
});
it("does not invoke the model when there is no currently qualified idle candidate", async () => {
  const f = fixture();
  f.busy();
  const result = await f.service.generate(session, incident, actor);
  expect(result.advice.candidateId).toBeNull();
  expect(result.aiRunId).toBeNull();
  expect(f.ai.generateStructuredWithRun).not.toHaveBeenCalled();
});
it("rejects foreign scope and forged student permissions before asking for candidates or invoking AI", async () => {
  const f = fixture();
  f.foreign();
  await expect(
    f.service.generate(session, incident, actor),
  ).rejects.toMatchObject({ status: 403 });
  expect(f.recruitment.listCandidates).not.toHaveBeenCalled();
  f.roles.clear();
  f.roles.add("intern");
  await expect(
    f.service.generate(session, incident, actor),
  ).rejects.toMatchObject({ status: 403 });
  expect(f.ai.generateStructuredWithRun).not.toHaveBeenCalled();
});
it("refuses an advice response after the underlying policy evidence changes during generation", async () => {
  const f = fixture(),
    invoke = f.ai.generateStructuredWithRun.getMockImplementation()!;
  f.ai.generateStructuredWithRun.mockImplementation(async (input) => {
    const result = await invoke(input);
    f.changed();
    return result;
  });
  await expect(
    f.service.generate(session, incident, actor),
  ).rejects.toMatchObject({ status: 409 });
  expect(f.ledger.event).not.toHaveBeenCalled();
});
it("does not persist advice when the provider fails", async () => {
  const f = fixture();
  f.ai.generateStructuredWithRun.mockRejectedValue(
    new Error("Provider unavailable"),
  );
  await expect(f.service.generate(session, incident, actor)).rejects.toThrow(
    "Provider unavailable",
  );
  expect(f.ledger.event).not.toHaveBeenCalled();
});
