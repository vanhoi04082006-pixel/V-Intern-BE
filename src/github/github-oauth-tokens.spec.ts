import { parseOAuthTokens } from './github-oauth-tokens';
describe('GitHub OAuth token response validation', () => {
  const rotated = { access_token: 'access-fixture', refresh_token: 'refresh-fixture', expires_in: 28800, refresh_token_expires_in: 15897600, scope: 'read:user public_repo', token_type: 'bearer' };
  it('accepts legacy access-only and complete expiring responses', () => {
    expect(parseOAuthTokens({ access_token: 'legacy-token' })).toEqual({ access_token: 'legacy-token' });
    expect(parseOAuthTokens(rotated, true)).toMatchObject({ access_token: 'access-fixture', refresh_token: 'refresh-fixture', expires_in: 28800 });
  });
  it.each([null, [], {}, { ...rotated, expires_in: 0 }, { ...rotated, expires_in: '28800' }, { ...rotated, expires_in: Infinity }, { ...rotated, refresh_token_expires_in: -1 }, { ...rotated, scope: [] }, { ...rotated, access_token: 'with whitespace' }, { ...rotated, error: 'bad_refresh_token' }])('rejects malformed provider metadata without exposing its contents', raw => {
    expect(() => parseOAuthTokens(raw)).toThrow('GitHub returned an incomplete token response.');
  });
  it('requires a new bounded refresh token for a rotation', () => {
    expect(() => parseOAuthTokens({ access_token: 'only-access' }, true)).toThrow();
    expect(() => parseOAuthTokens({ ...rotated, refresh_token: 'a'.repeat(4097) }, true)).toThrow();
  });
});
