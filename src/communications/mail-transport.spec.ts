import { classifySmtpError } from './mail-transport';
describe('SMTP acceptance ambiguity', () => {
  it('does not retry a DATA timeout or unknown connection loss', () => {
    expect(classifySmtpError({ code: 'ETIMEDOUT', command: 'DATA' }).status).toBe('uncertain');
    expect(classifySmtpError(Error('socket lost')).status).toBe('uncertain');
  });
  it('retries definite temporary rejection and pre-DATA failure only', () => {
    expect(classifySmtpError({ responseCode: 451, command: 'DATA' }).status).toBe('retry');
    expect(classifySmtpError({ command: 'CONN' }).status).toBe('retry');
    expect(classifySmtpError({ responseCode: 550 }).status).toBe('dead');
  });
});
