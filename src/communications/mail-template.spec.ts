import { renderMail, sealMail, openMail } from './mail-template';

const key = Buffer.alloc(32, 7).toString('base64');
describe('V-Intern mail boundaries', () => {
  it('encodes untrusted values in HTML and produces separate readable text', () => {
    const result = renderMail({ kind: 'schedule', name: '<img src=x onerror=alert(1)>', role: 'Backend', when: '25/10/2026 09:00 · Asia/Ho_Chi_Minh', ctaPath: '/login' }, 'http://localhost:3001');
    expect(result.html).toContain('&lt;img'); expect(result.html).not.toContain('<img');
    expect(result.text).toContain('15 phút'); expect(result.subject).toContain('Lịch phỏng vấn');
    expect(result.html).toContain('name="viewport"');
  });
  it.each(['https://evil.test/login', '//evil.test/login', '/\\evil.test', '/login\r\nBcc:x'])('rejects off-origin or injected CTA %s', ctaPath => {
    expect(() => renderMail({ kind: 'verify', name: 'Ứng viên', ctaPath }, 'https://vintern.test')).toThrow();
  });
  it('authenticates ciphertext and purpose, and does not store plaintext credentials', () => {
    const secret = { password: 'temporary-test-password' }; const sealed = sealMail(secret, key, 'job-1');
    expect(sealed).not.toContain(secret.password); expect(openMail(sealed, key, 'job-1')).toEqual(secret);
    expect(() => openMail(sealed, key, 'job-2')).toThrow();
    expect(() => openMail(sealed.slice(0, -3) + 'AAA', key, 'job-1')).toThrow();
  });
});
