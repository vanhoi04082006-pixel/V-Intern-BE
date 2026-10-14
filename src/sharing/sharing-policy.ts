import { ForbiddenException } from "@nestjs/common";

export function assertSharedRead(
  grant: {
    requesterId: string;
    ownerId: string;
    status: string;
    expiresAt: Date | null;
  },
  readerId: string,
  currentOwnerId: string | null,
  now = new Date(),
): void {
  if (
    grant.requesterId.toLowerCase() !== readerId.toLowerCase() ||
    grant.status !== "approved" ||
    !grant.expiresAt ||
    grant.expiresAt <= now ||
    currentOwnerId?.toLowerCase() !== grant.ownerId.toLowerCase()
  ) {
    throw new ForbiddenException({
      code: "SHARED_ACCESS_UNAVAILABLE",
      message: "Quyền xem chưa được cấp, đã hết hạn hoặc đã thu hồi.",
    });
  }
}
