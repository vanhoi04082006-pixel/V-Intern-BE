export function decideRepositoryAccess(input: {
  needed: boolean;
  owner: boolean;
  verifiedGrant: boolean;
  remoteStatus: "pending" | "accepted" | "expired" | "absent";
  matchingInvitation: boolean;
}): "keep" | "review" | "cancel_invitation" | "record_absent" {
  if (input.needed || input.owner) return "keep";
  if (input.remoteStatus === "expired" || input.remoteStatus === "absent")
    return "record_absent";
  if (!input.verifiedGrant || input.remoteStatus === "accepted")
    return "review";
  if (input.remoteStatus === "pending")
    return input.matchingInvitation ? "cancel_invitation" : "review";
  return "review";
}
