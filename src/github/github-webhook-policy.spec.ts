import { createHmac } from 'crypto';
import { verifyGithubDelivery, githubEventSummary } from './github-webhook-policy';
describe('GitHub webhook authenticity and immutable observations', () => {
  const secret = 'local-fixture-webhook-secret-with-32-bytes';
  const raw = Buffer.from('{"message":"Tiếng Việt — PR changed"}');
  const signature = 'sha256=' + createHmac('sha256', secret).update(raw).digest('hex');
  it('authenticates exact UTF-8 bytes and rejects altered JSON, missing or malformed signatures', () => {
    expect(() => verifyGithubDelivery(raw, signature, secret)).not.toThrow();
    for (const header of [undefined, 'sha256=abc', 'sha1=' + signature.slice(7), 'sha256=' + '0'.repeat(64)]) expect(() => verifyGithubDelivery(raw, header, secret)).toThrow();
    expect(() => verifyGithubDelivery(Buffer.from(raw.toString() + ' '), signature, secret)).toThrow();
    expect(() => verifyGithubDelivery(raw, signature, '')).toThrow();
  });
  it('extracts bounded PR/branch/head evidence without trusting check success as a grade', () => {
    expect(githubEventSummary('pull_request', { action: 'synchronize', number: 4, pull_request: { head: { sha: 'a'.repeat(40) }, updated_at: '2026-10-15T01:00:00Z' } })).toMatchObject({ action: 'synchronize', pullNumber: 4, headSha: 'a'.repeat(40) });
    const check = githubEventSummary('check_suite', { action: 'completed', check_suite: { head_sha: 'a'.repeat(40), conclusion: 'success' } });
    expect(check).not.toHaveProperty('passed');
    expect(check).not.toHaveProperty('score');
    expect(() => githubEventSummary('pull_request', { number: -1, pull_request: { head: { sha: 'not-sha' } } })).toThrow();
  });
});
