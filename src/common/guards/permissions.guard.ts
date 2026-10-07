import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsService } from '../../rbac/permissions.service';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';

/**
 * Authorization guard (global). Requires @RequirePermissions(...) metadata.
 * Effective permissions are ALWAYS resolved from the database per request
 * (direct roles + group-inherited roles) so revocation applies immediately —
 * the JWT never carries authority beyond authentication.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissionsService: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    if (!request.principal) {
      throw new UnauthorizedException({
        statusCode: 401,
        code: 'UNAUTHENTICATED',
        message: 'Missing bearer token.',
      });
    }

    const effective = await this.permissionsService.getEffectivePermissionCodes(request.principal.userId);
    const missing = required.filter((code) => !effective.has(code));
    if (missing.length > 0) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'PERMISSION_DENIED',
        message: `Missing permission(s): ${missing.join(', ')}.`,
      });
    }
    return true;
  }
}
