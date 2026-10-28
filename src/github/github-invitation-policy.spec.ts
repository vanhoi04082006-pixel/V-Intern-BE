import { GithubApiError, GithubClient } from "./github-client";
import { resolveInvitation } from "./github-invitation-policy";

const now = new Date("2026-10-25T01:00:00Z");
const repo = {
  ownerLogin: "platform",
  repoName: "vintern-demo",
  repoId: 99,
  githubOwnerId: 1,
};
const member = { githubUserId: 2 };
const invitation = {
  id: 50,
  invitee: { id: 2 },
  repository: { id: 99 },
  created_at: "2026-10-25T00:00:00Z",
  expired: false,
};
function fixture(
  options: {
    accepted?: boolean;
    pending?: unknown[];
    put?: unknown;
    error?: number;
    identity?: number;
  } = {},
) {
  const call = jest.fn(async (url: string, _token: string, method = "GET") => {
    if (url === "/user/2")
      return { id: options.identity ?? 2, login: "student-now" };
    if (method === "PUT") return "put" in options ? options.put : invitation;
    if (method === "DELETE") return undefined;
    if (url.includes("/invitations?")) return options.pending ?? [];
    if (options.error) throw new GithubApiError(options.error);
    if (options.accepted) return undefined;
    throw new GithubApiError(404);
  });
  return { call, client: { call } as unknown as GithubClient };
}
describe("GitHub invitation remote contract", () => {
  it("distinguishes 201 pending from accepted and stores ID, expiry and current numeric identity", async () => {
    const f = fixture();
    await expect(
      resolveInvitation(f.client, "private", repo, member, now, true),
    ).resolves.toMatchObject({
      status: "pending",
      invitationId: "50",
      githubUserId: "2",
      login: "student-now",
      invited: true,
      expiresAt: new Date("2026-11-01T00:00:00Z"),
    });
    expect(f.call).toHaveBeenCalledWith('/repos/platform/vintern-demo/collaborators/student-now','private','PUT',{permission:'push'},[201,204]);
  });
  it("recognizes existing collaborator without a PUT", async () => {
    const f = fixture({ accepted: true });
    await expect(
      resolveInvitation(f.client, "private", repo, member, now, true),
    ).resolves.toMatchObject({ status: "accepted", invited: false });
    expect(f.call.mock.calls.some((c) => c[2] === "PUT")).toBe(false);
  });
  it("does not resend a valid pending invitation even when staff asks to reinvite", async () => {
    const f = fixture({ pending: [invitation] });
    await expect(
      resolveInvitation(f.client, "private", repo, member, now, true),
    ).resolves.toMatchObject({ status: "pending", invited: false });
    expect(
      f.call.mock.calls.some((c) => c[2] === "PUT" || c[2] === "DELETE"),
    ).toBe(false);
  });
  it("treats PUT 204 as accepted, never as a pending invitation", async () => {
    const f = fixture({ put: undefined });
    await expect(
      resolveInvitation(f.client, "private", repo, member, now, true),
    ).resolves.toMatchObject({
      status: "accepted",
      invitationId: null,
      invited: false,
    });
  });
  it.each([403, 429, 500])(
    "fails closed on collaborator lookup %s without creating access",
    async (error) => {
      const f = fixture({ error });
      await expect(
        resolveInvitation(f.client, "private", repo, member, now, true),
      ).rejects.toThrow();
      expect(f.call.mock.calls.some((c) => c[2] === "PUT")).toBe(false);
    },
  );
  it("rejects a numeric identity mismatch before any permission call", async () => {
    const f = fixture({ identity: 3 });
    await expect(
      resolveInvitation(f.client, "private", repo, member, now, true),
    ).rejects.toThrow("GITHUB_IDENTITY_MISMATCH");
    expect(f.call).toHaveBeenCalledTimes(1);
  });
  it("keeps expired state during read-only reconciliation and does not silently reinvite", async () => {
    const f = fixture({ pending: [{ ...invitation, expired: true }] });
    await expect(
      resolveInvitation(f.client, "private", repo, member, now, false),
    ).resolves.toMatchObject({ status: "expired", invited: false });
    expect(f.call.mock.calls.some((c) => c[2] === "PUT")).toBe(false);
  });
  it("removes only the matching expired invitation before staff reinvites", async () => {
    const f = fixture({
      pending: [
        { ...invitation, expired: true },
        { ...invitation, id: 51, invitee: { id: 4 } },
      ],
    });
    await expect(
      resolveInvitation(f.client, "private", repo, member, now, true),
    ).resolves.toMatchObject({ status: "pending", invited: true });
    expect(
      f.call.mock.calls.filter((c) => c[2] === "DELETE").map((c) => c[0]),
    ).toEqual(["/repos/platform/vintern-demo/invitations/50"]);
  });
  it("rejects a successful response belonging to another repository or invitee", async () => {
    const f = fixture({ put: { ...invitation, repository: { id: 100 } } });
    await expect(
      resolveInvitation(f.client, "private", repo, member, now, true),
    ).rejects.toThrow("GITHUB_INVITATION_MISMATCH");
  });
  it("does not grant permissions during student reconciliation when invitation is absent", async () => {
    const f = fixture();
    await expect(
      resolveInvitation(f.client, "private", repo, member, now, false),
    ).resolves.toMatchObject({
      status: "failed",
      errorCode: "GITHUB_INVITATION_UNAVAILABLE",
    });
    expect(f.call.mock.calls.some((c) => c[2] === "PUT")).toBe(false);
  });
});
