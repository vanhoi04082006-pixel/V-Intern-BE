import { CanActivate, ExecutionContext, HttpException, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { RequestPrincipal } from '../common/types/request-principal';

/**
 * Recruitment/AI rate limiting (Phase 4, spec 56) — stricter per-user
 * limits on AI-cost-bearing routes. In-memory sliding window (per process;
 * the distributed store remains a documented pre-multi-instance item, the
 * same limitation as the global ThrottlerGuard).
 *
 * Limits come from configuration (throttle.interviewStartPerMin etc.) so
 * the e2e environment can raise them without code changes.
 */
export const RECRUITMENT_RATE_LIMIT_KEY = 'recruitment:rateLimitKey';

export type RecruitmentRateLimitBucket = 'interview-start' | 'interview-submit' | 'evaluation-retry';

export const RecruitmentRateLimit = (bucket: RecruitmentRateLimitBucket) =>
  SetMetadata(RECRUITMENT_RATE_LIMIT_KEY, bucket);

const WINDOW_MS = 60_000;

interface Hit {
  timestamps: number[];
}

@Injectable()
export class RecruitmentRateLimitGuard implements CanActivate {
  private static readonly store = new Map<string, Hit>();

  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const bucket = this.reflector.get<string>(RECRUITMENT_RATE_LIMIT_KEY, context.getHandler());
    if (!bucket) return true;

    const request = context.switchToHttp().getRequest<{ principal?: RequestPrincipal }>();
    const userId = request.principal?.userId ?? 'anonymous';
    const limit = this.limitFor(bucket);
    if (limit <= 0) return true;

    const key = `${bucket}:${userId}`;
    const now = Date.now();
    const hit = RecruitmentRateLimitGuard.store.get(key) ?? { timestamps: [] };
    hit.timestamps = hit.timestamps.filter((t) => now - t < WINDOW_MS);
    if (hit.timestamps.length >= limit) {
      throw new HttpException(
        {
          statusCode: 429,
          code: 'RATE_LIMITED',
          message: 'Too many requests — slow down and try again shortly.',
        },
        429,
      );
    }
    hit.timestamps.push(now);
    RecruitmentRateLimitGuard.store.set(key, hit);
    return true;
  }

  private limitFor(bucket: string): number {
    switch (bucket) {
      case 'interview-start':
        return Number(this.config.get<number>('throttle.interviewStartPerMin', 5));
      case 'interview-submit':
        return Number(this.config.get<number>('throttle.interviewSubmitPerMin', 6));
      case 'evaluation-retry':
        return Number(this.config.get<number>('throttle.evaluationPerMin', 3));
      default:
        return 0;
    }
  }
}
