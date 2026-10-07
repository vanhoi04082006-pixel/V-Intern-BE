import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../../users/users.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

interface JwtPayload {
  sub?: string;
  email?: string;
}

/**
 * Authentication guard (global).
 * - Verifies the bearer JWT.
 * - ALWAYS re-loads the user from the database and requires an active account
 *   (locked/deleted users are rejected even with a fresh, valid token).
 * - Attaches `request.principal` for downstream guards/decorators.
 * - Permissions are NOT resolved here — PermissionsGuard does that from the DB.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const header = request.headers['authorization'];
    if (typeof header !== 'string' || !header.startsWith('Bearer ')) {
      throw new UnauthorizedException({
        statusCode: 401,
        code: 'UNAUTHENTICATED',
        message: 'Missing bearer token.',
      });
    }

    const token = header.slice('Bearer '.length).trim();
    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException({
        statusCode: 401,
        code: 'TOKEN_INVALID',
        message: 'Access token is invalid or expired.',
      });
    }

    if (!payload.sub) {
      throw new UnauthorizedException({
        statusCode: 401,
        code: 'TOKEN_INVALID',
        message: 'Access token is invalid.',
      });
    }

    const user = await this.usersService.findActiveById(payload.sub);
    if (!user) {
      throw new UnauthorizedException({
        statusCode: 401,
        code: 'ACCOUNT_UNAVAILABLE',
        message: 'Account is no longer active.',
      });
    }

    request.principal = { userId: user.id, email: user.email };
    return true;
  }
}
