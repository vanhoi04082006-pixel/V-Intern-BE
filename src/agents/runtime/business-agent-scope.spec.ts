import { BusinessAgentScope } from "./business-agent-scope.service";
import { businessAgent } from "../definitions/business-agents";
import { DataSource } from "typeorm";
import { PermissionsService } from "../../rbac/permissions.service";
const own = "11111111-1111-4111-8111-111111111111",
  other = "22222222-2222-4222-8222-222222222222",
  resource = "33333333-3333-4333-8333-333333333333";
function fixture() {
  const roles = new Set(["instructor"]),
    permissions = new Set([
      "sprints.manage",
      "tasks.manage",
      "ai.evaluation.assist",
      "evaluations.manage",
      "ai.mentor.use",
      "recruitment.start.own",
      "recruitment.submit.own",
      "ai.recommendations.view.own",
    ]);
  let owner = own;
  const query = jest.fn(async (sql: string) => {
    if (sql.includes("FROM users")) return [{ status: "active" }];
    if (sql.includes("FROM interview_sessions"))
      return [{ userId: owner, roleCode: "backend" }];
    if (sql.includes("FROM ai_mentor_conversations"))
      return [{ userId: owner, status: "active" }];
    if (sql.includes("FROM task_submissions"))
      return [{ internId: other, projectId: resource, sprintId: null }];
    if (sql.includes("FROM projects")) return [{ mentorId: owner }];
    if (sql.includes("FROM evaluations"))
      return [
        {
          internId: other,
          evaluatorId: owner,
          projectId: null,
          sessionId: null,
        },
      ];
    if (sql.includes("FROM recruitment_profiles"))
      return [{ selectedRole: "backend" }];
    return [];
  });
  const service = new BusinessAgentScope(
    { query } as unknown as DataSource,
    {
      accessSnapshot: async () => ({ roles, permissions }),
      hasRole: async (_: string, role: string) => roles.has(role),
    } as unknown as PermissionsService,
  );
  return {
    service,
    roles,
    permissions,
    foreign: () => {
      owner = other;
    },
  };
}
describe("business Agent scopes are server-selected and role constrained", () => {
  it.each([
    ["sprint-plan", "project"],
    ["code_review", "task_submission"],
    ["evaluation-assistance", "evaluation"],
  ] as const)(
    "%s requires owning staff authority and refuses forged student grants",
    async (feature, type) => {
      const f = fixture(),
        definition = businessAgent(feature)!;
      expect(
        (await f.service.resolve(own, definition, type, resource)).policy
          .purpose,
      ).toBe(
        definition.consumer === "planner"
          ? "planning"
          : definition.consumer === "reviewer"
            ? "code_review"
            : "evaluation_assistance",
      );
      f.roles.clear();
      f.roles.add("intern");
      await expect(
        f.service.resolve(own, definition, type, resource),
      ).rejects.toThrow();
    },
  );
  it.each([
    ["interview_conversation", "interview_session"],
    ["recruitment-evaluation", "interview_session"],
    ["ai-mentor", "ai_mentor_conversation"],
  ] as const)(
    "%s refuses another student resource even with valid own permissions",
    async (feature, type) => {
      const f = fixture();
      f.roles.clear();
      f.roles.add("intern");
      await expect(
        f.service.resolve(own, businessAgent(feature)!, type, resource),
      ).resolves.toBeDefined();
      f.foreign();
      await expect(
        f.service.resolve(own, businessAgent(feature)!, type, resource),
      ).rejects.toThrow();
    },
  );
  it("recommendations are self-only for an intern and respect permission revocation", async () => {
    const f = fixture();
    f.roles.clear();
    f.roles.add("intern");
    const definition = businessAgent("recommendation")!;
    await expect(
      f.service.resolve(own, definition, "ai_recommendation_snapshot", own),
    ).resolves.toBeDefined();
    await expect(
      f.service.resolve(own, definition, "ai_recommendation_snapshot", other),
    ).rejects.toThrow();
    f.permissions.clear();
    await expect(
      f.service.resolve(own, definition, "ai_recommendation_snapshot", own),
    ).rejects.toThrow();
  });
});
