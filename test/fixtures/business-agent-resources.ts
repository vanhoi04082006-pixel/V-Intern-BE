import { randomUUID } from "node:crypto";
import type { DataSource } from "typeorm";
import { User } from "../../src/users/entities/user.entity";
import { Role } from "../../src/rbac/entities/role.entity";
import { UserRole } from "../../src/rbac/entities/user-role.entity";
import { Project } from "../../src/projects/entities/project.entity";
import { Task } from "../../src/tasks/entities/task.entity";
import { Evaluation } from "../../src/evaluation/entities/evaluation.entity";
import { EvaluationCycle } from "../../src/evaluation/entities/evaluation-cycle.entity";
import { RecruitmentProfile } from "../../src/recruitment/entities/recruitment-profile.entity";
import { InterviewSession } from "../../src/recruitment/entities/interview-session.entity";
import { AiMentorConversation } from "../../src/ai/mentor/entities/ai-mentor-conversation.entity";

/** Synthetic resources for bounded Agent acceptance. Never use an existing learner identity. */
export async function businessAgentResources(db: DataSource) {
  const users: string[] = [];
  for (const code of ["admin", "instructor", "intern"]) {
    const id = randomUUID(),
      role = await db.getRepository(Role).findOneByOrFail({ code });
    await db
      .getRepository(User)
      .insert({
        id,
        email: `${id}@g2.test`,
        username: id,
        displayName: "G2 synthetic acceptance",
        passwordHash: "not-a-login-hash",
        status: "active",
      });
    await db.getRepository(UserRole).insert({ userId: id, roleId: role.id });
    users.push(id);
  }
  const [admin, instructor, intern] = users;
  const profile = await db
    .getRepository(RecruitmentProfile)
    .save({
      userId: intern,
      selectedRole: "backend",
      status: "interview_in_progress",
      attemptCount: 1,
    });
  const interview = await db
    .getRepository(InterviewSession)
    .save({
      userId: intern,
      profileId: profile.id,
      roleCode: "backend",
      status: "in_progress",
      attemptNumber: 1,
      questionCount: 10,
    });
  const project = await db
    .getRepository(Project)
    .save({
      code: `G2-${randomUUID()}`,
      name: "G2 bounded Node exercise",
      description: "Synthetic input validation and evidence project.",
      mentorId: instructor,
      status: "active",
    });
  const conversation = await db
    .getRepository(AiMentorConversation)
    .save({ userId: intern, title: "G2 synthetic scope", status: "active" });
  const task = await db
    .getRepository(Task)
    .save({
      code: `G2-${randomUUID()}`,
      title: "Input contract",
      projectId: project.id,
      assigneeId: intern,
      createdById: instructor,
      status: "review",
    });
  const submission = randomUUID();
  await db.query(
    "INSERT INTO task_submissions(id,taskId,internId,prUrl,summary,status) VALUES(@0,@1,@2,@3,@4,'submitted')",
    [
      submission,
      task.id,
      intern,
      "https://github.com/example/g2-synthetic/pull/1",
      "Synthetic static review, no execution receipt.",
    ],
  );
  const cycle = await db
    .getRepository(EvaluationCycle)
    .save({
      code: `G2-${randomUUID()}`,
      name: "Synthetic evaluation",
      projectId: project.id,
      type: "sprint",
      status: "open",
      startDate: new Date("2026-01-01"),
      endDate: new Date("2027-01-01"),
      createdById: instructor,
    });
  const evaluation = await db
    .getRepository(Evaluation)
    .save({
      cycleId: cycle.id,
      internId: intern,
      evaluatorId: instructor,
      projectId: project.id,
      status: "draft",
    });
  return {
    admin,
    instructor,
    intern,
    interview: interview.id,
    project: project.id,
    submission,
    conversation: conversation.id,
    evaluation: evaluation.id,
  };
}
