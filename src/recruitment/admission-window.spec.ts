import { admissionWindow } from "./admission-window";

const startsAt = new Date("2026-10-25T02:00:00Z");
const base = {
  startsAt,
  bookingStatus: "confirmed",
  applicationStatus: "booked",
  sessionId: null,
  noShowAt: null,
};
describe("scheduled interview admission", () => {
  it.each([
    [-1, "waiting"],
    [0, "ready"],
    [14 * 60000 + 59000, "ready"],
    [15 * 60000 - 1, "ready"],
    [15 * 60000, "no_show"],
  ])("uses server milliseconds at offset %s", (offset, expected) => {
    expect(
      admissionWindow(base, new Date(startsAt.getTime() + Number(offset))),
    ).toBe(expected);
  });
  it("keeps an admitted session admitted after the 15-minute threshold", () => {
    expect(
      admissionWindow(
        { ...base, sessionId: "session" },
        new Date(startsAt.getTime() + 3600000),
      ),
    ).toBe("started");
  });
  it("does not reopen a cancelled or no-show booking when the browser clock changes", () => {
    expect(
      admissionWindow({ ...base, bookingStatus: "cancelled" }, startsAt),
    ).toBe("cancelled");
    expect(admissionWindow({ ...base, noShowAt: startsAt }, new Date(0))).toBe(
      "no_show",
    );
  });
});
