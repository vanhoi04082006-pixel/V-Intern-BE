import { BadRequestException, PayloadTooLargeException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
export const GITHUB_WEBHOOK_EVENTS = ['push', 'pull_request', 'check_suite', 'workflow_run'] as const;
export function verifyGithubDelivery(raw: Buffer | undefined, signature: string | undefined, secret: string): void {
  if (secret.length < 32) throw new ServiceUnavailableException({ code: 'GITHUB_WEBHOOK_NOT_CONFIGURED', message: 'Webhook GitHub chưa được cấu hình.' });
  if (!raw || !Buffer.isBuffer(raw)) throw new BadRequestException({ code: 'GITHUB_RAW_BODY_REQUIRED', message: 'Không có raw body để kiểm tra chữ ký.' });
  if (raw.length > 1024 * 1024) throw new PayloadTooLargeException();
  if (!signature || !/^sha256=[0-9a-f]{64}$/i.test(signature)) throw new UnauthorizedException({ code: 'GITHUB_WEBHOOK_SIGNATURE_INVALID', message: 'Chữ ký webhook không hợp lệ.' });
  const actual = Buffer.from(signature.slice(7), 'hex'), expected = createHmac('sha256', secret).update(raw).digest();
  if (!timingSafeEqual(actual, expected)) throw new UnauthorizedException({ code: 'GITHUB_WEBHOOK_SIGNATURE_INVALID', message: 'Chữ ký webhook không hợp lệ.' });
}
const object = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
export function githubEventSummary(event: string, payload: unknown) {
  const body = object(payload);
  const action = typeof body.action === 'string' && /^[a-z_]{1,32}$/.test(body.action) ? body.action : event === 'push' ? 'pushed' : event === 'ping' ? 'ping' : 'received';
  let headSha: string | null = null, pullNumber: number | null = null, branch: string | null = null;
  if (event === 'pull_request') {
    const pr = object(body.pull_request), head = object(pr.head);
    if (!Number.isSafeInteger(body.number) || Number(body.number) <= 0 || Number(body.number) > 2147483647 || typeof head.sha !== 'string' || !/^[0-9a-f]{40}$/i.test(head.sha)) throw new BadRequestException('Payload pull request không hợp lệ.');
    pullNumber = Number(body.number); headSha = head.sha.toLowerCase();
  } else if (event === 'push') {
    if (typeof body.ref !== 'string' || !body.ref.startsWith('refs/heads/') || body.ref.length > 200 || typeof body.after !== 'string' || !/^[0-9a-f]{40}$/i.test(body.after)) throw new BadRequestException('Payload push không hợp lệ.');
    branch = body.ref.slice(11); headSha = body.after.toLowerCase();
  } else if (event === 'check_suite' || event === 'workflow_run') {
    const run = object(body[event]);
    if (typeof run.head_sha === 'string' && /^[0-9a-f]{40}$/i.test(run.head_sha)) headSha = run.head_sha.toLowerCase();
  }
  return { action, headSha, pullNumber, branch };
}
