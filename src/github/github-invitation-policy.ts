import { GithubApiError, GithubClient } from "./github-client";

export type InvitationStatus =
  "pending" | "accepted" | "expired" | "failed" | "not_connected";
export interface InvitationRepository {
  ownerLogin: string;
  repoName: string;
  repoId: string | number | null;
  githubOwnerId: string | number;
}
export interface InvitationResult {
  status: InvitationStatus;
  githubUserId: string | null;
  login: string | null;
  invitationId: string | null;
  invitedAt: Date | null;
  expiresAt: Date | null;
  errorCode: string | null;
  invited: boolean;
}
interface RemoteInvitation {
  id: number;
  invitee: { id: number } | null;
  repository: { id: number };
  created_at: string;
  expired: boolean;
}
export const invitationRepoPath = (repo: InvitationRepository) =>
  `/repos/${encodeURIComponent(repo.ownerLogin)}/${encodeURIComponent(repo.repoName)}`;

/** Only server-verified numeric identity and remote membership can establish access. */
export async function resolveInvitation(
  client: GithubClient,
  token: string,
  repo: InvitationRepository,
  member: { githubUserId: string | number | null },
  now: Date,
  allowInvite: boolean,
): Promise<InvitationResult> {
  const result: InvitationResult = {
    status: "not_connected",
    githubUserId:
      member.githubUserId === null ? null : String(member.githubUserId),
    login: null,
    invitationId: null,
    invitedAt: null,
    expiresAt: null,
    errorCode: null,
    invited: false,
  };
  if (member.githubUserId === null) return result;
  if (!/^[1-9]\d{0,18}$/.test(String(member.githubUserId)))
    throw Error("GITHUB_IDENTITY_MISMATCH");
  const identity = await client.call<{ id: number; login: string }>(
    `/user/${member.githubUserId}`,
    token,
  );
  if (
    String(identity.id) !== String(member.githubUserId) ||
    !/^[a-zA-Z0-9-]{1,39}$/.test(identity.login)
  )
    throw Error("GITHUB_IDENTITY_MISMATCH");
  result.login = identity.login;
  const base = invitationRepoPath(repo);
  if (String(repo.githubOwnerId) === String(identity.id))
    return { ...result, status: "accepted" };
  try {
    await client.call(
      `${base}/collaborators/${encodeURIComponent(identity.login)}`,
      token,
    );
    return { ...result, status: "accepted" };
  } catch (error) {
    if (!(error instanceof GithubApiError) || error.upstreamStatus !== 404)
      throw error;
  }
  let found: RemoteInvitation | undefined;
  for (let page = 1; page <= 5; page++) {
    const invitations = await client.call<RemoteInvitation[]>(
      `${base}/invitations?per_page=100&page=${page}`,
      token,
    );
    if (!Array.isArray(invitations)) throw Error("GITHUB_INVITATION_MISMATCH");
    found = invitations.find(
      (i) => String(i.invitee?.id) === String(identity.id),
    );
    if (found || invitations.length < 100) break;
    if (page === 5) throw Error("GITHUB_INVITATION_SCAN_LIMIT");
  }
  const snapshot = (invitation: RemoteInvitation): InvitationResult => {
    const invitedAt = new Date(invitation.created_at);
    if (
      !Number.isSafeInteger(invitation.id) ||
      invitation.id <= 0 ||
      String(invitation.invitee?.id) !== String(identity.id) ||
      String(invitation.repository?.id) !== String(repo.repoId) ||
      !Number.isFinite(invitedAt.getTime())
    )
      throw Error("GITHUB_INVITATION_MISMATCH");
    const expiresAt = new Date(invitedAt.getTime() + 7 * 86400000);
    return {
      ...result,
      status: invitation.expired || expiresAt <= now ? "expired" : "pending",
      invitationId: String(invitation.id),
      invitedAt,
      expiresAt,
    };
  };
  if (found) {
    const current = snapshot(found);
    if (current.status === "pending" || !allowInvite) return current;
    await client.call(
      `${base}/invitations/${current.invitationId}`,
      token,
      "DELETE",
    );
  }
  if (!allowInvite)
    return {
      ...result,
      status: "failed",
      errorCode: "GITHUB_INVITATION_UNAVAILABLE",
    };
  const created = await client.call<RemoteInvitation | undefined>(
    `${base}/collaborators/${encodeURIComponent(identity.login)}`,
    token,
    "PUT",
    { permission: "push" },
  );
  if (created === undefined) return { ...result, status: "accepted" };
  const pending = snapshot(created);
  if (pending.status !== "pending") throw Error("GITHUB_INVITATION_MISMATCH");
  return { ...pending, invited: true };
}
