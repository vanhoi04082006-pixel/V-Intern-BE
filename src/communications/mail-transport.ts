import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';
export type MailOutcome = { status: 'accepted' | 'retry' | 'dead' | 'uncertain'; code: string };
export interface MailEnvelope { to: string; subject: string; html: string; text: string }
export function classifySmtpError(error: unknown): MailOutcome {
  const e = error as { code?: string; command?: string; responseCode?: number };
  if (e.responseCode && e.responseCode >= 500) return { status: 'dead', code: 'SMTP_REJECTED' };
  if (e.responseCode && e.responseCode >= 400) return { status: 'retry', code: 'SMTP_TEMPORARY' };
  if (['CONN', 'EHLO', 'HELO', 'AUTH', 'MAIL FROM', 'RCPT TO'].includes(e.command ?? '') || ['ECONNECTION', 'EDNS', 'EAUTH'].includes(e.code ?? '')) return { status: 'retry', code: 'SMTP_CONNECT_FAILED' };
  // DATA/socket timeout may follow successful acceptance. Do not retry blindly.
  return { status: 'uncertain', code: 'SMTP_ACCEPTANCE_UNKNOWN' };
}
@Injectable()
export class MailTransport {
  constructor(private readonly config: ConfigService) {}
  configured() { return !!this.config.get<string>('SMTP_HOST') && !!this.config.get<string>('SMTP_FROM'); }
  async send(id: string, envelope: MailEnvelope): Promise<MailOutcome> {
    if (!this.configured()) return { status: 'retry', code: 'SMTP_NOT_CONFIGURED' };
    const secure = this.config.get('SMTP_SECURE', 'true') === 'true';
    const transport = nodemailer.createTransport({
      host: this.config.get<string>('SMTP_HOST'), port: Number(this.config.get('SMTP_PORT', secure ? '465' : '587')), secure,
      requireTLS: !secure && this.config.get('SMTP_DEV_ALLOW_PLAIN', 'false') !== 'true',
      auth: this.config.get('SMTP_USER') ? { user: this.config.get<string>('SMTP_USER'), pass: this.config.get<string>('SMTP_PASSWORD') } : undefined,
      connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000,
      disableFileAccess: true, disableUrlAccess: true, logger: false, debug: false,
    });
    try {
      const result = await transport.sendMail({ ...envelope, from: this.config.get<string>('SMTP_FROM'), messageId: `<${id}@mail.vintern.local>` });
      return result.accepted.length === 1 ? { status: 'accepted', code: 'SMTP_ACCEPTED' } : { status: 'dead', code: 'SMTP_REJECTED' };
    } catch (error) { return classifySmtpError(error); }
    finally { transport.close(); }
  }
}
