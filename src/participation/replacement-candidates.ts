import type { DataSource, EntityManager } from "typeorm";
/** Internal eligibility check after staff scope resolution; shared by advice and approval. */
export async function eligibleReplacementCandidates(
  db: DataSource | EntityManager,
  roleCode: string,
  ids: readonly string[],
): Promise<Array<{ id: string; displayName: string }>> {
  if (!ids.length) return [];
  if (ids.length > 20) throw Error("REPLACEMENT_CANDIDATE_BATCH_EXCEEDED");
  return db.query(
    `SELECT u.id,u.displayName FROM users u
    JOIN recruitment_profiles rp ON rp.userId=u.id AND rp.status='passed' AND rp.selectedRole=@${ids.length}
    JOIN career_roles cr ON cr.code=rp.selectedRole AND cr.status='published'
    WHERE u.id IN(${ids.map((_, i) => "@" + i).join(",")}) AND u.status='active'
    AND EXISTS(SELECT 1 FROM user_roles ur JOIN roles r ON r.id=ur.roleId WHERE ur.userId=u.id AND r.code='intern')
    AND NOT EXISTS(SELECT 1 FROM assignments a WHERE a.internId=u.id AND a.status='active')
    AND NOT EXISTS(SELECT 1 FROM tasks t JOIN projects p ON p.id=t.projectId AND p.status='active' LEFT JOIN sprints sp ON sp.id=t.sprintId
      WHERE t.assigneeId=u.id AND t.deletedAt IS NULL AND t.status<>'done' AND (sp.id IS NULL OR sp.status IN('planned','active')))`,
    [...ids, roleCode],
  );
}
