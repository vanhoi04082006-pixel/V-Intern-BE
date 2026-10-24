import { ForbiddenException, SetMetadata } from "@nestjs/common";
export const ALLOW_TEMPORARY_PASSWORD = "vintern:allowTemporaryPassword";
export const AllowTemporaryPassword = () =>
  SetMetadata(ALLOW_TEMPORARY_PASSWORD, true);
export function enforceTemporaryPassword(
  user: {
    mustChangePassword?: boolean;
    temporaryPasswordExpiresAt?: Date | null;
  },
  allow: boolean,
  now = Date.now(),
) {
  if (!user.mustChangePassword) return;
  if (
    !user.temporaryPasswordExpiresAt ||
    user.temporaryPasswordExpiresAt.getTime() <= now
  )
    throw new ForbiddenException({
      code: "TEMPORARY_PASSWORD_EXPIRED",
      message:
        "Mật khẩu tạm đã hết hạn. Liên hệ người phụ trách để được hỗ trợ.",
    });
  if (!allow)
    throw new ForbiddenException({
      code: "PASSWORD_CHANGE_REQUIRED",
      message: "Cần đổi mật khẩu tạm trước khi dùng hệ thống.",
    });
}
