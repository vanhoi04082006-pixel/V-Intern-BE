import { ForbiddenException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { PermissionsService } from '../rbac/permissions.service';
import { assertReviewerScope } from '../submissions/submission-access';

export class CodeReviewAuthorityError extends ForbiddenException {
  constructor() { super({ code: 'AI_REVIEWER_UNAVAILABLE', message: 'Chưa có giảng viên phụ trách đủ quyền để chạy Agent chấm bài.' }); }
}

/** An own-submission request dispatches existing reviewer authority; it grants no staff permission to its caller. */
export async function resolveCodeReviewActor(
  db: Pick<DataSource, 'query'>,
  permissions: PermissionsService,
  task: { projectId: string; sprintId: string | null },
  submission: { internId: string },
  requestedBy: string,
): Promise<string> {
  const deny = (): never => { throw new CodeReviewAuthorityError(); };
  const requester = await permissions.accessSnapshot(requestedBy);
  let actor = requestedBy;
  if (!requester.roles.has('admin') && !requester.roles.has('instructor')) {
    if (submission.internId.toLowerCase() !== requestedBy.toLowerCase()) deny();
    const [project]: Array<{ mentorId: string | null }> = await db.query('SELECT mentorId FROM projects WHERE id=@0', [task.projectId]);
    actor = project?.mentorId ?? deny();
  }
  const [user]: Array<{ status: string }> = await db.query('SELECT status FROM users WHERE id=@0', [actor]);
  const access = await permissions.accessSnapshot(actor);
  if (user?.status !== 'active' || (!access.roles.has('admin') && !access.roles.has('instructor')) || !access.permissions.has('tasks.manage')) deny();
  try {
    await assertReviewerScope(db, permissions, task, actor);
  } catch (error) {
    if (error instanceof ForbiddenException) deny();
    throw error;
  }
  return actor;
}
