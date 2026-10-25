import { randomUUID } from "node:crypto";
import { DataSource } from "typeorm";
export async function accessFixture(db: DataSource) {
  const teacher = randomUUID(),
    target = randomUUID(),
    candidate = randomUUID(),
    sessionId = randomUUID(),
    projectId = randomUUID(),
    taskId = randomUUID(),
    oldAssignment = randomUUID(),
    newAssignment = randomUUID(),
    incident = randomUUID(),
    advice = randomUUID(),
    command = randomUUID(),
    replacementId = randomUUID(),
    jobId = randomUUID();
  for (const id of [teacher, target, candidate])
    await db.query(
      "INSERT INTO users(id,email,username,displayName,passwordHash,status) VALUES(@0,@1,@0,'Access fixture','not-a-login','active')",
      [id, id + "@access.test"],
    );
  await db.query(
    "INSERT INTO internship_sessions(id,code,name,status,leadInstructorId,startDate,endDate) VALUES(@0,@0,'Access fixture','active',@1,SYSUTCDATETIME(),DATEADD(day,7,SYSUTCDATETIME()))",
    [sessionId, teacher],
  );
  await db.query(
    "INSERT INTO projects(id,code,name,description,status,mentorId) VALUES(@0,@0,'Access fixture','Disposable queue test','active',@1)",
    [projectId, teacher],
  );
  for (const [id, user, status] of [
    [oldAssignment, target, "cancelled"],
    [newAssignment, candidate, "active"],
  ])
    await db.query(
      "INSERT INTO assignments(id,internId,projectId,sessionId,status,assignedById,assignedAt) VALUES(@0,@1,@2,@3,@4,@5,SYSUTCDATETIME())",
      [id, user, projectId, sessionId, status, teacher],
    );
  await db.query(
    "INSERT INTO tasks(id,code,title,projectId,assigneeId,status) VALUES(@0,@0,'Access historical task',@1,@2,'done')",
    [taskId, projectId, target],
  );
  await db.query(
    "INSERT INTO participation_incidents(id,taskId,internId,sessionId,deadlineVersion,policyVersion,dueAt,kind,status,ordinal,points,recommendReplacement,policySnapshot) VALUES(@0,@1,@2,@3,1,1,SYSUTCDATETIME(),'late','active',3,0,1,'{\"replacementFrom\":3}')",
    [incident, taskId, target, sessionId],
  );
  await db.query(
    "INSERT INTO participation_events(id,sessionId,internId,taskId,incidentId,action,detail) VALUES(@0,@1,@2,@3,@4,'replacement.advised','{}')",
    [advice, sessionId, target, taskId, incident],
  );
  await db.query(
    "INSERT INTO participation_replacement_commands(id,sessionId,adviceId,incidentId,oldAssignmentId,targetInternId,candidateId,projectId,roleCode,previewJson,previewHash,createdById,status,approvedById,approvedAt,resultJson) VALUES(@0,@1,@2,@3,@4,@5,@6,@7,'frontend','{}',@8,@9,'approved',@9,SYSUTCDATETIME(),'{}')",
    [
      command,
      sessionId,
      advice,
      incident,
      oldAssignment,
      target,
      candidate,
      projectId,
      "0".repeat(64),
      teacher,
    ],
  );
  await db.query(
    "INSERT INTO participation_replacements(id,commandId,sessionId,oldAssignmentId,newAssignmentId,oldInternId,newInternId,reason,approvedById,movementJson) VALUES(@0,@1,@2,@3,@4,@5,@6,'Approved fixture replacement',@7,'{}')",
    [
      replacementId,
      command,
      sessionId,
      oldAssignment,
      newAssignment,
      target,
      candidate,
      teacher,
    ],
  );
  await db.query(
    "INSERT INTO repository_access_jobs(id,replacementId,sessionId,userId) VALUES(@0,@1,@2,@3)",
    [jobId, replacementId, sessionId, target],
  );
  return {
    teacher,
    target,
    candidate,
    sessionId,
    projectId,
    jobId,
    replacementId,
  };
}
