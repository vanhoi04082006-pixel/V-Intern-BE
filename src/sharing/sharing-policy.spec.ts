import { assertSharedRead } from "./sharing-policy";

describe("explicit read-only session consent", () => {
  const now = new Date("2026-10-14T10:00:00Z");
  const grant = {
    requesterId: "reader",
    ownerId: "OWNER",
    status: "approved",
    expiresAt: new Date(now.getTime() + 1000),
  };
  it("allows only the recipient, while consent and original ownership remain valid", () => {
    expect(() => assertSharedRead(grant, "READER", "owner", now)).not.toThrow();
  });
  it.each(["pending", "denied", "revoked"])("denies %s requests", (status) => {
    expect(() =>
      assertSharedRead({ ...grant, status }, "reader", "owner", now),
    ).toThrow();
  });
  it("denies expired grants, strangers and a transferred session", () => {
    expect(() =>
      assertSharedRead({ ...grant, expiresAt: now }, "reader", "owner", now),
    ).toThrow();
    expect(() => assertSharedRead(grant, "stranger", "owner", now)).toThrow();
    expect(() => assertSharedRead(grant, "reader", "new-owner", now)).toThrow();
    expect(() => assertSharedRead(grant, "reader", null, now)).toThrow();
  });
});
