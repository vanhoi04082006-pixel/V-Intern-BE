import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export interface MailContent {
  kind: 'verify' | 'schedule' | 'credentials' | 'existing-account' | 'cancelled' | 'github-invitation';
  name: string;
  ctaPath: string;
  role?: string;
  when?: string;
  username?: string;
  password?: string;
  session?: string;
  repository?: string;
}
const escape = (v: string) => v.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
export function renderMail(content: MailContent, origin: string) {
  const base = new URL(origin);
  if (!['https:', 'http:'].includes(base.protocol) || base.username || base.password || base.pathname !== '/') throw Error('MAIL_ORIGIN_INVALID');
  if (!content.ctaPath.startsWith('/') || content.ctaPath.startsWith('//') || /[\\\r\n]/.test(content.ctaPath)) throw Error('MAIL_CTA_INVALID');
  const link = new URL(content.ctaPath, base);
  if (link.origin !== base.origin) throw Error('MAIL_CTA_INVALID');
  const schedule = content.kind === 'schedule';
  const title = content.kind === 'github-invitation' ? 'Lời mời cộng tác dự án GitHub' : content.kind === 'verify' ? 'Xác minh email ứng tuyển' : schedule ? 'Lịch phỏng vấn của bạn' : content.kind === 'cancelled' ? 'Lịch phỏng vấn đã được hủy' : 'Thông tin đăng nhập phỏng vấn của bạn';
  const subject = `[V-Intern] ${schedule ? `Lịch phỏng vấn • ${content.role ?? ''} • ${content.when ?? ''}` : title}`.replace(/[\r\n]/g, ' ').slice(0, 240);
  const paragraphs = [
    `Xin chào ${content.name},`,
    content.kind === 'github-invitation' ? `Phiên thực tập: ${content.session}. Repository: ${content.repository}. Lời mời có hiệu lực đến ${content.when}. Mở V-Intern để kiểm tra đúng tài khoản GitHub đã liên kết, sau đó chấp nhận lời mời trên GitHub. Nếu lời mời hết hạn hoặc không mở được, liên hệ giảng viên để được mời lại. Email này là thông báo của V-Intern; email mời gốc của GitHub được gửi riêng và không thể tùy chỉnh.` :
    content.kind === 'verify' ? 'Bạn vừa nộp hồ sơ tại V-Intern. Xác minh email để chúng tôi phân tích CV và xếp lịch trong các khung giờ đang mở. Liên kết có hiệu lực 24 giờ và chỉ được dùng một lần.' :
    schedule ? `Vai trò: ${content.role}. Thời gian: ${content.when}. Chuẩn bị CV, máy tính và kết nối mạng ổn định. Đến trễ từ 15 phút khi chưa bắt đầu: hồ sơ được hoãn sang đợt sau. Thông tin đăng nhập được gửi bằng một email riêng trước giờ phỏng vấn.` :
    content.kind === 'credentials' ? `Tài khoản: ${content.username}\nMật khẩu tạm: ${content.password}\nBạn phải đổi mật khẩu ngay lần đăng nhập đầu tiên. Không chia sẻ email này.` :
    content.kind === 'cancelled' ? 'Lịch hẹn cũ không còn hiệu lực. Vui lòng theo dõi hồ sơ để nhận lịch mới.' : 'Bạn đã có tài khoản V-Intern. Dùng mật khẩu hiện tại để đăng nhập; hệ thống không thay đổi mật khẩu của bạn. Nếu quên mật khẩu, liên hệ người quản trị để được hỗ trợ.',
    'V-Intern · Kết nối năng lực, kiến tạo hành trình thực tập.',
  ];
  const cta = content.kind === 'verify' ? 'Xác minh & theo dõi hồ sơ' : 'Mở V-Intern';
  const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#f3f6fb;color:#172b4d;font:16px/1.65 Arial,sans-serif"><main style="max-width:600px;margin:24px auto;padding:28px;background:#fff;border-top:4px solid #2563eb"><p style="font-weight:bold;color:#2563eb;letter-spacing:1px">V-INTERN</p><h1 style="font-size:24px;line-height:1.3">${escape(title)}</h1>${paragraphs.map(p => `<p style="white-space:pre-line">${escape(p)}</p>`).join('')}<p><a href="${escape(link.href)}" style="display:inline-block;padding:12px 20px;background:#2563eb;color:white;text-decoration:none;border-radius:6px">${cta}</a></p><p style="font-size:12px;color:#64748b">Nếu bạn không thực hiện yêu cầu này, hãy bỏ qua thư. Không trả lời bằng mật khẩu hoặc mã xác minh.</p></main></body></html>`;
  return { subject, html, text: `${title}\n\n${paragraphs.join('\n\n')}\n\n${cta}: ${link.href}` };
}
function encryptionKey(raw: string): Buffer {
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) throw Error('MAIL_ENCRYPTION_KEY_REQUIRED');
  return key;
}
export function sealMail(value: unknown, key: string, purpose: string): string {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', encryptionKey(key), iv);
  cipher.setAAD(Buffer.from(purpose.toLowerCase()));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
}
export function openMail(value: string, key: string, purpose: string): unknown {
  const bytes = Buffer.from(value, 'base64'), decipher = createDecipheriv('aes-256-gcm', encryptionKey(key), bytes.subarray(0, 12));
  decipher.setAAD(Buffer.from(purpose.toLowerCase())); decipher.setAuthTag(bytes.subarray(12, 28));
  return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8'));
}
