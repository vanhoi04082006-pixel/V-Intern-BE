import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'vintern:requirePermissions';

/**
 * Requires the caller to hold ALL listed permission codes.
 * Effective permissions are always resolved from the database
 * (direct role assignments + group-inherited roles), never from the JWT.
 */
export const RequirePermissions = (...codes: string[]) =>
  SetMetadata(PERMISSIONS_KEY, codes);
