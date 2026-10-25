import type { EntityManager } from "typeorm";
import type {
  InvitationRepository,
  InvitationResult,
} from "./github-invitation-policy";
const numericId = (value: unknown) =>
  typeof value === "number"
    ? Number.isSafeInteger(value) && value > 0
    : typeof value === "string" && /^[1-9]\d{0,18}$/.test(value);
/** Only resolveInvitation's verified 201 result is admissible. Never backfill ownership from observed invitations or 204 access. */
export async function recordSystemInvitation(
  em: EntityManager,
  eventId: string,
  sessionId: string,
  userId: string,
  repo: InvitationRepository,
  result: InvitationResult,
) {
  if (!result.invited) return;
  if (
    result.status !== "pending" ||
    ![
      repo.repoId,
      repo.githubOwnerId,
      result.githubUserId,
      result.invitationId,
    ].every(numericId) ||
    String(repo.githubOwnerId) === result.githubUserId
  )
    throw Error("GITHUB_GRANT_PROOF_INVALID");
  const [event] = await em.query(
    "SELECT id FROM github_invitation_events WHERE id=@0 AND sessionId=@1 AND userId=@2 AND githubUserId=@3 AND invitationId=@4 AND status='pending' AND action='invited'",
    [eventId, sessionId, userId, result.githubUserId, result.invitationId],
  );
  if (!event) throw Error("GITHUB_GRANT_PROOF_INVALID");
  await em.query(
    `IF NOT EXISTS(SELECT 1 FROM github_repository_grants WITH(UPDLOCK,HOLDLOCK) WHERE repoId=@3 AND githubUserId=@4 AND invitationId=@6)
    INSERT INTO github_repository_grants(id,sourceSessionId,sourceUserId,repoId,githubUserId,githubOwnerId,invitationId,provenance) VALUES(@0,@1,@2,@3,@4,@5,@6,'github_201')`,
    [
      eventId,
      sessionId,
      userId,
      String(repo.repoId),
      result.githubUserId,
      String(repo.githubOwnerId),
      result.invitationId,
    ],
  );
}
