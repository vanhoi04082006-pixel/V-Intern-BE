import { ConflictException, Injectable, Logger, NotFoundException, OnApplicationBootstrap, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { DataSource, EntityManager } from 'typeorm';
import { MailContent, openMail, renderMail, sealMail } from './mail-template';
import { MailEnvelope, MailTransport } from './mail-transport';

interface MailRow { id: string; status: string; attempts: number; sealedPayload: string | null; sensitive: boolean; expiresAt: Date; kind: string }
export interface EnqueueMail { eventKey: string; ownerId?: string; to: string; content: MailContent; availableAt: Date; expiresAt: Date; sensitive?: boolean }
@Injectable()
export class CommunicationsService implements OnApplicationBootstrap, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private readonly logger = new Logger(CommunicationsService.name);
  constructor(private readonly db: DataSource, private readonly config: ConfigService, private readonly transport: MailTransport) {}
  private key() {
    const key = this.config.get<string>('MAIL_ENCRYPTION_KEY', '');
    if (Buffer.from(key, 'base64').length !== 32) throw new ServiceUnavailableException({ code: 'MAIL_NOT_CONFIGURED', message: 'Cần cấu hình khóa bảo vệ email ở máy chủ.' });
    return key;
  }
  origin() { return this.config.get<string>('PUBLIC_WEB_ORIGIN', 'http://localhost:3001'); }
  ready() { this.key(); return this.transport.configured(); }
  async enqueue(input: EnqueueMail, em: EntityManager = this.db.manager): Promise<string> {
    if (!em.queryRunner?.isTransactionActive) return this.db.transaction(tx => this.enqueue(input, tx));
    if (!/^[^\s@<>\r\n]+@[^\s@<>\r\n]+\.[^\s@<>\r\n]+$/.test(input.to) || input.to.length > 320 || input.eventKey.length > 200 || input.expiresAt <= input.availableAt) throw Error('MAIL_INPUT_INVALID');
    const id = randomUUID(), envelope = { to: input.to, ...renderMail(input.content, this.origin()) };
    const sealed = sealMail(envelope, this.key(), id);
    const recipientHint = input.to.replace(/^(.).*(@.*)$/, '$1***$2');
    const rows = await em.query(`IF NOT EXISTS(SELECT 1 FROM mail_outbox WITH(UPDLOCK,HOLDLOCK) WHERE eventKey=@0)
      INSERT INTO mail_outbox(id,eventKey,ownerId,kind,recipientHint,sealedPayload,sensitive,availableAt,expiresAt)
      VALUES(@1,@0,@2,@3,@4,@5,@6,@7,@8);
      SELECT id FROM mail_outbox WHERE eventKey=@0`, [input.eventKey, id, input.ownerId ?? null, input.content.kind, recipientHint, sealed, !!input.sensitive, input.availableAt.toISOString(), input.expiresAt.toISOString()]);
    return rows[0].id;
  }
  onApplicationBootstrap() {
    if (this.config.get('MAIL_WORKER_ENABLED', 'false') !== 'true' || this.config.get('NODE_ENV') === 'test') return;
    this.timer = setInterval(() => void this.tick().catch(() => this.logger.error('MAIL_WORKER_FAILED')), 5000); this.timer.unref();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }
  async tick(now = new Date()): Promise<number> {
    if (this.running || !this.transport.configured()) return 0;
    this.running = true;
    try {
      this.key();
      // A crashed worker may have sent DATA. Preserve uncertainty instead of duplicating mail.
      const timestamp = now.toISOString();
      await this.db.query("UPDATE mail_outbox SET status='uncertain',lastCode='LEASE_EXPIRED',leaseToken=NULL,leaseUntil=NULL,updatedAt=@0 WHERE status='sending' AND leaseUntil<=@0", [timestamp]);
      await this.db.query("UPDATE mail_outbox SET status='expired',sealedPayload=NULL,updatedAt=@0 WHERE expiresAt<=@0 AND status IN('pending','uncertain','dead','cancelled','accepted')", [timestamp]);
      const lease = randomUUID();
      const jobs: MailRow[] = await this.db.query(`;WITH due AS(SELECT TOP(1) * FROM mail_outbox WITH(UPDLOCK,READPAST,ROWLOCK) WHERE status='pending' AND availableAt<=@0 AND expiresAt>@0 AND attempts<5 ORDER BY availableAt,createdAt)
        UPDATE due SET status='sending',attempts=attempts+1,leaseToken=@1,leaseUntil=DATEADD(second,90,CAST(@0 AS datetime2)),updatedAt=@0 OUTPUT inserted.*`, [timestamp, lease]);
      if (!jobs.length) return 0;
      const job = jobs[0];
      let outcome;
      let envelope: MailEnvelope | undefined;
      try { envelope = openMail(job.sealedPayload!, this.key(), job.id) as MailEnvelope; }
      catch { outcome = { status: 'dead' as const, code: 'MAIL_PAYLOAD_INVALID' }; }
      if (envelope) {
        try { outcome = await this.transport.send(job.id, envelope); }
        catch { outcome = { status: 'uncertain' as const, code: 'SMTP_ACCEPTANCE_UNKNOWN' }; }
      }
      if (!outcome) throw Error('MAIL_OUTCOME_MISSING');
      const status = outcome.status === 'retry' ? job.attempts >= 5 ? 'dead' : 'pending' : outcome.status;
      await this.db.transaction(async em => {
        const updated = await em.query(`UPDATE mail_outbox SET status=@2,lastCode=@3,leaseToken=NULL,leaseUntil=NULL,availableAt=DATEADD(second,@4,CAST(@5 AS datetime2)),updatedAt=@5,
          sealedPayload=CASE WHEN sensitive=1 AND @2='accepted' THEN NULL ELSE sealedPayload END
          OUTPUT inserted.id WHERE id=@0 AND status='sending' AND leaseToken=@1`, [job.id, lease, status, outcome.code, Math.min(3600, 30 * 2 ** job.attempts), timestamp]);
        if (updated.length) await em.query('INSERT INTO mail_receipts(mailId,attempt,outcome,code) VALUES(@0,@1,@2,@3)', [job.id, job.attempts, status, outcome.code]);
      });
      return 1;
    } finally { this.running = false; }
  }
  async list(page = 1) {
    const offset = (Math.max(1, Math.min(10000, page)) - 1) * 25;
    const items = await this.db.query('SELECT id,kind,recipientHint,status,attempts,availableAt,expiresAt,lastCode,createdAt FROM mail_outbox ORDER BY createdAt DESC,id OFFSET @0 ROWS FETCH NEXT 25 ROWS ONLY', [offset]);
    const [count] = await this.db.query('SELECT COUNT(*) total FROM mail_outbox');
    return { items, total: count.total, page, pageSize: 25, transportConfigured: this.transport.configured() };
  }
  async preview(id: string) {
    const [row]: MailRow[] = await this.db.query('SELECT id,kind,status,attempts,sealedPayload,sensitive,expiresAt FROM mail_outbox WHERE id=@0', [id]);
    if (!row) throw new NotFoundException();
    if (row.sensitive || !row.sealedPayload || row.expiresAt <= new Date()) return { redacted: true, message: 'Nội dung có liên kết riêng/mật khẩu được bảo vệ và không hiển thị.' };
    const mail = openMail(row.sealedPayload, this.key(), row.id) as MailEnvelope;
    return { redacted: false, subject: mail.subject, text: mail.text, html: mail.html };
  }
  async resend(id: string, acknowledgeUncertain = false) {
    const rows = await this.db.query(`UPDATE mail_outbox WITH(UPDLOCK,ROWLOCK) SET status='pending',attempts=0,availableAt=SYSUTCDATETIME(),lastResendAt=SYSUTCDATETIME(),lastCode=NULL
      OUTPUT inserted.id WHERE id=@0 AND sensitive=0 AND sealedPayload IS NOT NULL AND expiresAt>SYSUTCDATETIME()
      AND status IN('dead','accepted','bounced','uncertain') AND (status<>'uncertain' OR @1=1)
      AND (lastResendAt IS NULL OR lastResendAt<DATEADD(second,-60,SYSUTCDATETIME()))`, [id, acknowledgeUncertain]);
    if (!rows.length) throw new ConflictException({ code: 'MAIL_RESEND_UNAVAILABLE', message: 'Email đang xử lý, cần chờ 60 giây, đã hết hạn hoặc chứa dữ liệu chỉ được cấp lại từ hồ sơ. Với trạng thái chưa rõ, cần xác nhận nguy cơ gửi trùng.' });
    return { queued: true };
  }
}
