import { ServiceUnavailableException } from '@nestjs/common';
export interface OAuthTokens {
  access_token: string;
  scope?: string;
  expires_in?: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
}
export function parseOAuthTokens(raw: unknown, requireRotation = false): OAuthTokens {
  const invalid = () => new ServiceUnavailableException({ code: 'GITHUB_TOKEN_RESPONSE_INVALID', message: 'GitHub returned an incomplete token response.' });
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw invalid();
  const v = raw as Record<string, unknown>;
  const token = (value: unknown) => typeof value === 'string' && value.length > 0 && value.length <= 4096 && !/\s/.test(value);
  const expiry = (value: unknown) => Number.isSafeInteger(value) && Number(value) > 0 && Number(value) <= 31536000;
  if (!token(v.access_token) || v.error || v.token_type !== undefined && v.token_type !== 'bearer' ||
    v.scope !== undefined && (typeof v.scope !== 'string' || v.scope.length > 512) ||
    v.expires_in !== undefined && !expiry(v.expires_in) ||
    v.refresh_token !== undefined && (!token(v.refresh_token) || !expiry(v.expires_in) || !expiry(v.refresh_token_expires_in)) ||
    requireRotation && (!token(v.refresh_token) || !expiry(v.expires_in) || !expiry(v.refresh_token_expires_in))) throw invalid();
  return { access_token: v.access_token as string, ...(v.scope === undefined ? {} : { scope: v.scope as string }),
    ...(v.expires_in === undefined ? {} : { expires_in: v.expires_in as number }),
    ...(v.refresh_token === undefined ? {} : { refresh_token: v.refresh_token as string, refresh_token_expires_in: v.refresh_token_expires_in as number }) };
}
