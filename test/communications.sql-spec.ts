import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { createServer, Server, Socket } from 'node:net';
import { randomUUID } from 'node:crypto';
import source from '../src/database/data-source';
import { CommunicationsService, EnqueueMail } from '../src/communications/communications.service';
import { MailTransport } from '../src/communications/mail-transport';

let db: DataSource, server: Server, port: number;
const received: string[] = [], sockets = new Set<Socket>();
const config = (smtp = false) => new ConfigService({ MAIL_ENCRYPTION_KEY: Buffer.alloc(32, 3).toString('base64'), PUBLIC_WEB_ORIGIN: 'http://localhost:3001', ...(smtp ? { SMTP_HOST: '127.0.0.1', SMTP_PORT: port, SMTP_FROM: 'V-Intern <noreply@vintern.test>', SMTP_SECURE: 'false', SMTP_DEV_ALLOW_PLAIN: 'true' } : {}) });
const input = (extra: Partial<EnqueueMail> = {}): EnqueueMail => ({ eventKey: randomUUID(), to: 'candidate@vintern.test', content: { kind: 'schedule', name: 'Ứng viên', role: 'Backend', when: '25/10 09:00', ctaPath: '/login' }, availableAt: new Date(Date.now() - 1000), expiresAt: new Date(Date.now() + 86400000), ...extra });
const worker = (send: MailTransport['send']) => new CommunicationsService(db, config(), { configured: () => true, send } as MailTransport);
beforeAll(async () => {
  const database = process.env.E2E_DB_NAME ?? '';
  if (!/^VIntern_E2E_CI_\d+_\d+$/.test(database) || source.options.type !== 'mssql') throw Error('Disposable SQL required');
  db = new DataSource({ ...source.options, database }); await db.initialize();
  server = createServer(socket => {
    sockets.add(socket); socket.on('close', () => sockets.delete(socket)); socket.write('220 local V-Intern test SMTP\r\n');
    let buffer = '', data = false, body = '';
    socket.on('data', bytes => { buffer += bytes.toString(); let i: number;
      while ((i = buffer.indexOf('\r\n')) >= 0) {
        const line = buffer.slice(0, i); buffer = buffer.slice(i + 2);
        if (data) { if (line === '.') { received.push(body); body = ''; data = false; socket.write('250 accepted for local fixture\r\n'); } else body += line + '\r\n'; }
        else if (/^EHLO/.test(line)) socket.write('250-localhost\r\n250 8BITMIME\r\n');
        else if (line === 'DATA') { data = true; socket.write('354 send data\r\n'); }
        else if (line === 'QUIT') socket.end('221 bye\r\n'); else socket.write('250 ok\r\n');
      }
    });
  });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r)); port = (server.address() as { port: number }).port;
});
afterAll(async () => { for (const s of sockets) s.destroy(); if (server) await new Promise<void>(r => server.close(() => r())); if (db?.isInitialized) await db.destroy(); });
const row = async (id: string) => (await db.query('SELECT * FROM mail_outbox WHERE id=@0', [id]))[0];
describe('durable SQL mail queue', () => {
  it('deduplicates concurrent enqueue and leases one send across two workers', async () => {
    const w = worker(async () => ({ status: 'accepted', code: 'SMTP_ACCEPTED' })), value = input();
    const [a, b] = await Promise.all([db.transaction(em => w.enqueue(value, em)), db.transaction(em => w.enqueue(value, em))]);
    expect(a).toBe(b);
    let sends = 0; const send = async () => { sends++; return { status: 'accepted' as const, code: 'SMTP_ACCEPTED' }; };
    await Promise.all([worker(send).tick(), worker(send).tick()]); expect(sends).toBe(1);
    expect((await row(a)).status).toBe('accepted');
  });
  it('does not consume attempts while SMTP is unconfigured', async () => {
    const w = new CommunicationsService(db, config(), new MailTransport(config())), id = await w.enqueue(input());
    expect(await w.tick()).toBe(0); expect((await row(id)).attempts).toBe(0);
    await db.query("UPDATE mail_outbox SET status='cancelled' WHERE id=@0", [id]);
  });
  it('obeys schedule, retries temporary rejection, then dead-letters at five attempts', async () => {
    const w = worker(async () => ({ status: 'retry', code: 'SMTP_TEMPORARY' })), start = new Date(Date.now() + 60000), id = await w.enqueue(input({ availableAt: start }));
    expect(await w.tick(new Date(start.getTime() - 1))).toBe(0);
    for (let attempt = 1; attempt <= 5; attempt++) { await w.tick(new Date(start.getTime() + attempt * 3600000)); }
    expect(await row(id)).toMatchObject({ status: 'dead', attempts: 5, lastCode: 'SMTP_TEMPORARY' });
  });
  it('preserves ambiguity after DATA timeout and crashed lease; resend requires explicit acknowledgement', async () => {
    const w = worker(async () => ({ status: 'uncertain', code: 'SMTP_ACCEPTANCE_UNKNOWN' })), id = await w.enqueue(input());
    await w.tick(); expect((await row(id)).status).toBe('uncertain'); await expect(w.resend(id)).rejects.toThrow();
    await w.resend(id, true); await expect(w.resend(id, true)).rejects.toThrow();
    await db.query("UPDATE mail_outbox SET status='sending',leaseUntil=DATEADD(second,-1,SYSUTCDATETIME()) WHERE id=@0", [id]);
    await w.tick(); expect((await row(id)).lastCode).toBe('LEASE_EXPIRED');
    await db.query("UPDATE mail_outbox SET status='cancelled' WHERE id=@0", [id]);
  });
  it('uses actual local SMTP and erases credential payload after acceptance', async () => {
    const c = config(true), w = new CommunicationsService(db, c, new MailTransport(c));
    const id = await w.enqueue(input({ sensitive: true, content: { kind: 'credentials', name: 'Candidate', ctaPath: '/login', username: 'test', password: 'local-fixture-secret' } }));
    expect((await row(id)).sealedPayload).not.toContain('local-fixture-secret'); expect(await w.preview(id)).toMatchObject({ redacted: true });
    await w.tick(); expect(await row(id)).toMatchObject({ status: 'accepted', sealedPayload: null });
    expect(received).toHaveLength(1); expect(received[0]).toContain(`Message-ID: <${id}@mail.vintern.local>`);
    await expect(w.resend(id)).rejects.toThrow();
    expect((await db.query('SELECT outcome FROM mail_receipts WHERE mailId=@0', [id]))[0].outcome).toBe('accepted');
  });
});
