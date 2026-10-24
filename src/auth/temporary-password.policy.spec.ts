import { enforceTemporaryPassword } from "./temporary-password.policy";
describe("mandatory first-login password change", () => {
  const now = 1000;
  it("allows original accounts and only the password-change surface for a temporary account", () => {
    expect(() => enforceTemporaryPassword({}, false, now)).not.toThrow();
    const user = {
      mustChangePassword: true,
      temporaryPasswordExpiresAt: new Date(2000),
    };
    expect(() => enforceTemporaryPassword(user, true, now)).not.toThrow();
    expect(() => enforceTemporaryPassword(user, false, now)).toThrow();
  });
  it("rejects the exact expiry boundary including the password-change surface", () => {
    expect(() =>
      enforceTemporaryPassword(
        { mustChangePassword: true, temporaryPasswordExpiresAt: new Date(now) },
        true,
        now,
      ),
    ).toThrow();
  });
});
