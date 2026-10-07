/**
 * Principal attached to authenticated requests by JwtAuthGuard.
 * Permissions are NEVER taken from the JWT payload — they are always
 * re-resolved from the database by PermissionsGuard (revocation-safe).
 */
export interface RequestPrincipal {
  userId: string;
  email: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      principal?: RequestPrincipal;
    }
  }
}

export interface SessionUser {
  id: string;
  email: string;
  displayName: string;
  status: string;
  roles: string[];
  permissions: string[];
}
