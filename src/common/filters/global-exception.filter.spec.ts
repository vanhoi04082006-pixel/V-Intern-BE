import { ArgumentsHost, Logger } from '@nestjs/common';
import { GlobalExceptionFilter } from './global-exception.filter';
describe('body parser errors', () => {
  function response(error: Error) {
    const json = jest.fn(), status = jest.fn().mockReturnValue({ json });
    const host = { switchToHttp: () => ({ getResponse: () => ({ status }), getRequest: () => ({ method: 'POST', url: '/api/v1/github/webhook' }) }) };
    new GlobalExceptionFilter().catch(error, host as unknown as ArgumentsHost);
    return { status, body: json.mock.calls[0][0] };
  }
  it.each([['entity.too.large', 413, 'PAYLOAD_TOO_LARGE'], ['entity.parse.failed', 400, 'INVALID_JSON'], ['encoding.unsupported', 415, 'UNSUPPORTED_MEDIA_TYPE']])('returns a safe structured response for %s', (type, code, label) => {
    const result = response(Object.assign(new Error('Private answer contents must not leak'), { type, status: code, body: 'private-answer-marker' }));
    expect(result.status).toHaveBeenCalledWith(code);
    expect(result.body.code).toBe(label);
    expect(JSON.stringify(result.body)).not.toMatch(/private-answer-marker|Private answer contents/);
  });
  it('does not trust arbitrary status/type properties on internal errors', () => {
    const log = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    try { expect(response(Object.assign(new Error('Internal failure'), { type: 'custom.error', status: 400 })).status).toHaveBeenCalledWith(500); }
    finally { log.mockRestore(); }
  });
});
