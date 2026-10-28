import { decideRepositoryAccess } from "./repository-access.policy";
const base = {
  needed: false,
  owner: false,
  verifiedGrant: true,
  remoteStatus: "pending" as const,
  matchingInvitation: true,
};
it("cancels only the exact pending invitation proven to have been requested by this system", () => {
  expect(decideRepositoryAccess(base)).toBe("cancel_invitation");
});
it.each([{ needed: true }, { owner: true }])(
  "preserves access when another scope needs it or it belongs to the owner: %j",
  (change) => {
    expect(decideRepositoryAccess({ ...base, ...change })).toBe("keep");
  },
);
it.each([
  { verifiedGrant: false },
  { matchingInvitation: false },
  { remoteStatus: "accepted" as const },
])(
  "requires review when current permission origin cannot be established: %j",
  (change) => {
    expect(decideRepositoryAccess({ ...base, ...change })).toBe("review");
  },
);
it.each(["expired", "absent"] as const)(
  "records %s without a destructive API call",
  (remoteStatus) => {
    expect(decideRepositoryAccess({ ...base, remoteStatus })).toBe(
      "record_absent",
    );
  },
);
