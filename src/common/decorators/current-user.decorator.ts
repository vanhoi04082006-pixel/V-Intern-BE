import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { RequestPrincipal } from '../types/request-principal';

/**
 * Injects the authenticated principal (set by JwtAuthGuard).
 * Usage: `@CurrentUser() principal: RequestPrincipal` or
 * `@CurrentUser('userId') userId: string`.
 */
export const CurrentUser = createParamDecorator(
  (data: keyof RequestPrincipal | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const principal = request.principal as RequestPrincipal | undefined;
    if (!principal) return undefined;
    return data ? principal[data] : principal;
  },
);
