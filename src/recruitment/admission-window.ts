export const ADMISSION_GRACE_MS = 15 * 60_000;
export type AdmissionPhase =
  "waiting" | "ready" | "started" | "no_show" | "cancelled";
export interface AdmissionWindow {
  startsAt: Date;
  bookingStatus: string;
  applicationStatus: string;
  sessionId: string | null;
  noShowAt: Date | null;
}
export function admissionWindow(
  input: AdmissionWindow,
  now: Date,
): AdmissionPhase {
  if (input.sessionId) return "started";
  if (input.noShowAt) return "no_show";
  if (
    input.bookingStatus !== "confirmed" ||
    input.applicationStatus !== "booked"
  )
    return "cancelled";
  if (now < input.startsAt) return "waiting";
  return now.getTime() >= input.startsAt.getTime() + ADMISSION_GRACE_MS
    ? "no_show"
    : "ready";
}
