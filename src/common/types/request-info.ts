/** Extract client IP (proxy-aware) and User-Agent from an express request. */
import { Request } from 'express';

export function clientIp(req: Request): string | null {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length > 0) {
    return xff.split(',')[0].trim().slice(0, 64);
  }
  return req.socket?.remoteAddress?.slice(0, 64) ?? null;
}

export function userAgent(req: Request): string | null {
  const ua = req.headers['user-agent'];
  return typeof ua === 'string' && ua.length > 0 ? ua.slice(0, 256) : null;
}
